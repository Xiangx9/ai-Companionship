/**
 * Teaching session actions (start / answer / history).
 */
import type { ComputedRef } from 'vue'
import { describeAiError } from '@/utils/aiError'
import type {
  LearningProject,
  TeachingSession,
  TeachingMessage,
} from '@/types/learning'
import { teachKnowledgePoint, chatCompletion } from '@/services/aiEngine'
import { parseAndValidateAiJson } from '@/utils/aiJson'
import {
  findKnowledgePoint,
  getLatestSession,
  uid,
  isAbortError,
} from './helpers'

export type TeachSessionApiDeps = {
  activeProject: ComputedRef<LearningProject | undefined>
  persist: () => void
  recordTeachInteraction: (kpId: string) => unknown
}

export function createTeachSessionApi(deps: TeachSessionApiDeps) {
  const { activeProject, persist, recordTeachInteraction } = deps

  function getTeachingMessages(kpId: string): TeachingMessage[] {
    const project = activeProject.value
    if (!project) return []
    const session = getLatestSession(project, kpId)
    return session?.messages ? [...session.messages] : []
  }

  function getTeachingSession(kpId: string): TeachingSession | null {
    const project = activeProject.value
    if (!project) return null
    return getLatestSession(project, kpId) ?? null
  }

  async function startTeaching(
    kpId: string,
    opts?: {
      forceNew?: boolean
      signal?: AbortSignal
      onDelta?: (msg: TeachingMessage) => void
    },
  ) {
    const project = activeProject.value
    if (!project) return null
    const kp = findKnowledgePoint(project.path, kpId)
    if (!kp) return null

    let session = getLatestSession(project, kpId)
    const forceNew = opts?.forceNew === true

    if (!session || forceNew || session.currentStep === 'finished') {
      session = {
        id: uid('session'),
        kpId,
        messages: [],
        currentStep: 'explaining',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      project.teachingSessions.push(session)
    }

    const placeholder: TeachingMessage = {
      id: uid('msg'),
      role: 'teacher',
      content: '',
      type: 'text',
      timestamp: new Date().toISOString(),
    }
    session.messages.push(placeholder)
    session.currentStep = 'explaining'
    opts?.onDelta?.({ ...placeholder })

    try {
      const teacherMsg = await teachKnowledgePoint(
        { id: kp.id, title: kp.title, description: kp.description, keyPoints: kp.keyPoints },
        project.path.level,
        session.messages.filter((m) => m.id !== placeholder.id),
        {
          signal: opts?.signal,
          messageId: placeholder.id,
          onDelta: (fullText) => {
            placeholder.content = fullText
            opts?.onDelta?.({ ...placeholder })
          },
        },
      )
      placeholder.content = teacherMsg.content
      placeholder.timestamp = teacherMsg.timestamp
      session.currentStep = 'asking_question'
      session.updatedAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()
      recordTeachInteraction(kpId)
      persist()
      opts?.onDelta?.({ ...placeholder })
      return { ...placeholder }
    } catch (err) {
      if (isAbortError(err)) {
        if (!placeholder.content.trim()) {
          placeholder.content = '（讲解已中断，可点「继续教学」再试）'
        } else {
          placeholder.content = placeholder.content.trim() + '\n\n——\n（已中断，可点「继续教学」）'
        }
        session.currentStep = 'asking_question'
        session.updatedAt = new Date().toISOString()
        project.updatedAt = new Date().toISOString()
        persist()
        opts?.onDelta?.({ ...placeholder })
        throw err
      }
      if (!placeholder.content.trim()) {
        const idx = session.messages.findIndex((m) => m.id === placeholder.id)
        if (idx >= 0) session.messages.splice(idx, 1)
      } else {
        session.currentStep = 'asking_question'
        session.updatedAt = new Date().toISOString()
        project.updatedAt = new Date().toISOString()
        persist()
      }
      throw err
    }
  }

  async function submitAnswer(
    kpId: string,
    answer: string,
    opts?: {
      displayContent?: string
      kind?: 'answer' | 'directive'
      signal?: AbortSignal
      onDelta?: (msg: TeachingMessage) => void
    },
  ) {
    const project = activeProject.value
    if (!project) return null
    const kp = findKnowledgePoint(project.path, kpId)
    let session = getLatestSession(project, kpId)
    if (!session) {
      session = {
        id: uid('session'),
        kpId,
        messages: [],
        currentStep: 'waiting_answer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      project.teachingSessions.push(session)
    }

    const studentMsg: TeachingMessage = {
      id: uid('msg'),
      role: 'student',
      content: answer,
      displayContent: opts?.displayContent,
      type: 'text',
      timestamp: new Date().toISOString(),
    }
    session.messages.push(studentMsg)
    session.studentAnswer = answer
    session.updatedAt = new Date().toISOString()

    const kind = opts?.kind || 'answer'

    if (kind === 'directive') {
      session.currentStep = 'explaining'
      const placeholder: TeachingMessage = {
        id: uid('msg'),
        role: 'teacher',
        content: '',
        type: 'text',
        timestamp: new Date().toISOString(),
      }
      session.messages.push(placeholder)
      opts?.onDelta?.({ ...placeholder })
      try {
        if (!kp) throw new Error('知识点不存在')
        const teacherMsg = await teachKnowledgePoint(
          { id: kp.id, title: kp.title, description: kp.description, keyPoints: kp.keyPoints },
          project.path.level,
          session.messages.filter((m) => m.id !== placeholder.id),
          {
            signal: opts?.signal,
            messageId: placeholder.id,
            onDelta: (fullText) => {
              placeholder.content = fullText
              opts?.onDelta?.({ ...placeholder })
            },
          },
        )
        placeholder.content = teacherMsg.content
        placeholder.timestamp = teacherMsg.timestamp
        session.currentStep = 'asking_question'
        recordTeachInteraction(kpId)
        opts?.onDelta?.({ ...placeholder })
      } catch (err) {
        if (isAbortError(err)) {
          if (!placeholder.content.trim()) {
            placeholder.content = '（讲解已中断，可点快捷按钮或继续提问）'
          } else {
            placeholder.content = placeholder.content.trim() + '\n\n——\n（已中断）'
          }
          session.currentStep = 'asking_question'
          opts?.onDelta?.({ ...placeholder })
        } else if (!placeholder.content.trim()) {
          const idx = session.messages.findIndex((m) => m.id === placeholder.id)
          if (idx >= 0) session.messages.splice(idx, 1)
          session.messages.push({
            id: uid('msg'),
            role: 'teacher',
            content: describeAiError(err).message + ' 可点上方快捷按钮或再说一次。',
            type: 'feedback',
            timestamp: new Date().toISOString(),
          })
          session.currentStep = 'asking_question'
        } else {
          session.currentStep = 'asking_question'
        }
      }
      session.updatedAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()
      persist()
      return session
    }

    // Normal answer path: grade student response
    session.currentStep = 'grading'
    const lastTeacherMsg = [...session.messages].reverse().find((m) => m.role === 'teacher')
    try {
      const feedback = await chatCompletion(
        [
          {
            role: 'system',
            content:
              '你是老师，请评价学生的回答，给出分数和改进建议。' +
              '只输出 JSON: {"score": 0-100, "feedback": "评语", "nextHint": "下一步引导"}',
          },
          {
            role: 'user',
            content: `知识点对话上下文（最近几条）：\n${session.messages
              .slice(-6)
              .map((m) => m.role + ': ' + m.content)
              .join('\n')}\n\n老师上次内容：${lastTeacherMsg?.content ?? '无'}\n学生回答：${answer}`,
          },
        ],
        { temperature: 0.3, signal: opts?.signal },
      )

      const cleaned = parseAndValidateAiJson(
        feedback,
        (v): v is { score: number; feedback: string; nextHint?: string } => {
          return (
            !!v &&
            typeof v === 'object' &&
            typeof (v as { score?: unknown }).score === 'number' &&
            typeof (v as { feedback?: unknown }).feedback === 'string'
          )
        },
        '教学评分',
      )

      session.score = cleaned.score
      const teacherFeedback: TeachingMessage = {
        id: uid('msg'),
        role: 'teacher',
        content: cleaned.nextHint
          ? `${cleaned.feedback}\n\n——\n下一步：${cleaned.nextHint}`
          : cleaned.feedback,
        type: 'feedback',
        timestamp: new Date().toISOString(),
      }
      session.messages.push(teacherFeedback)
      session.currentStep = cleaned.score >= 70 ? 'continuing' : 'asking_question'
      recordTeachInteraction(kpId)
    } catch (err) {
      if (isAbortError(err)) {
        session.currentStep = 'asking_question'
      } else {
        session.messages.push({
          id: uid('msg'),
          role: 'teacher',
          content: 'AI 评分暂时出错了，不过没关系——你能再说说你的理解吗？我换个角度继续教你。',
          type: 'feedback',
          timestamp: new Date().toISOString(),
        })
        session.currentStep = 'asking_question'
      }
    }

    session.updatedAt = new Date().toISOString()
    project.updatedAt = new Date().toISOString()
    persist()
    return session
  }

  return {
    getTeachingMessages,
    getTeachingSession,
    startTeaching,
    submitAnswer,
  }
}
