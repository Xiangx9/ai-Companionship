<!-- AI 教学对话框组件 -->
<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import type { TeachingMessage } from '@/types/learning'
import { renderMessageContent } from '@/utils/markdown'

export type ChatSendPayload =
  | string
  | { text: string; display?: string; kind?: 'answer' | 'directive' }

interface Props {
  messages: TeachingMessage[]
  kpTitle: string
  disabled?: boolean
  statusText?: string
  /** Message currently being streamed (show caret) */
  streamingId?: string | null
}
const props = withDefaults(defineProps<Props>(), { disabled: false, statusText: '', streamingId: null })
const emit = defineEmits<{ send: [payload: ChatSendPayload]; cancel: [] }>()

const input = ref('')
const chatRef = ref<HTMLElement>()

const QUICK_ACTIONS = [
  {
    id: 'shorter',
    label: '再说短一点',
    prompt:
      '【快捷指令·再说短一点】上一段偏长。请只重讲「当前这一步」，正文不超过 150 字（代码另计），列表优先，保留 1 个检查问题。不要开启新的大步骤。',
  },
  {
    id: 'example',
    label: '再举一例',
    prompt:
      '【快捷指令·再举一例】请只针对当前概念再给 1 个更简单、更生活化的例子（可含极短可运行代码）。不要开新大步骤；结尾仍只留 1 个检查问题。',
  },
  {
    id: 'confused',
    label: '我还不懂',
    prompt:
      '【快捷指令·我还不懂】请假设我是完全新手，用更基础的类比重讲当前概念，正文不超过 200 字，结尾给 1 个更简单的检查问题。',
  },
] as const

const renderedMessages = computed(() =>
  props.messages.map((msg) => ({
    ...msg,
    html: renderMessageContent(msg.displayContent || msg.content),
  })),
)

const showQuickActions = computed(() => {
  if (props.disabled) return false
  if (!props.messages.length) return false
  return props.messages[props.messages.length - 1]?.role === 'teacher'
})

watch(
  () => [props.messages.length, props.messages.map((m) => m.content.length).join(',')].join('|'),
  () => {
    nextTick(() => scrollToBottom())
  },
)

function scrollToBottom() {
  if (chatRef.value) {
    chatRef.value.scrollTop = chatRef.value.scrollHeight
  }
}

function sendMessage() {
  if (!input.value.trim() || props.disabled) return
  emit('send', input.value.trim())
  input.value = ''
}

function sendQuick(action: (typeof QUICK_ACTIONS)[number]) {
  if (props.disabled) return
  emit('send', {
    text: action.prompt,
    display: action.label,
    kind: 'directive',
  })
}

function getTypeIcon(type: string) {
  const icons: Record<string, string> = {
    text: '💬',
    code: '💻',
    diagram: '📊',
    question: '❓',
    feedback: '📈',
  }
  return icons[type] ?? '💬'
}
</script>


<template>
  <div class="ai-chat">
    <div class="chat-header">
      <div class="teacher-avatar">🧑‍🏫</div>
      <div class="header-copy">
        <div class="teacher-name">Learning Mentor</div>
        <div class="teacher-topic">{{ kpTitle }}</div>
      </div>
      <span class="live-pill">教学中</span>
    </div>

    <div ref="chatRef" class="chat-messages">
      <div v-if="renderedMessages.length === 0" class="empty-chat">
        <div class="empty-icon">🧑‍🏫</div>
        <p>点击下方「开始 AI 教学」开启本知识点的私教会话</p>
      </div>
      <div
        v-for="(msg, idx) in renderedMessages"
        :key="msg.id"
        class="message"
        :class="[msg.role, { streaming: streamingId === msg.id }]"
      >
        <div class="message-icon">{{ getTypeIcon(msg.type) }}</div>
        <div class="message-body">
          <div class="message-content">
            <span v-html="msg.html"></span>
            <span v-if="streamingId === msg.id" class="stream-caret" aria-hidden="true"></span>
          </div>
          <div class="message-time">{{ new Date(msg.timestamp).toLocaleTimeString('zh-CN') }}</div>
          <div
            v-if="showQuickActions && idx === renderedMessages.length - 1 && msg.role === 'teacher'"
            class="quick-actions"
          >
            <button
              v-for="action in QUICK_ACTIONS"
              :key="action.id"
              type="button"
              class="quick-btn"
              :disabled="disabled"
              @click="sendQuick(action)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="disabled || statusText" class="thinking-bar" aria-live="polite">
      <span class="spinner"></span>
      <span>{{ statusText || 'AI 正在思考，请稍候…' }}</span>
      <button
        v-if="disabled"
        type="button"
        class="cancel-stream-btn"
        @click="emit('cancel')"
      >停止</button>
    </div>

    <div class="chat-input-area">
      <input
        v-model="input"
        class="chat-input"
        placeholder="输入你的回答..."
        :disabled="disabled"
        @keydown.enter="sendMessage"
      />
      <button class="btn btn-primary send-btn" type="button" :disabled="disabled || !input.trim()" @click="sendMessage">发送</button>
    </div>
  </div>
</template>

<style scoped>
.ai-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background:
    linear-gradient(180deg, rgba(79,140,255,0.05), transparent 18%),
    rgba(12, 18, 32, 0.92);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(8, 12, 22, 0.28);
}

.teacher-avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background:
    linear-gradient(145deg, rgba(79,140,255,0.18), rgba(34,195,166,0.1));
  border: 1px solid rgba(79,140,255,0.22);
  font-size: 20px;
}

.header-copy {
  min-width: 0;
  flex: 1;
}

.teacher-name {
  font-size: 14px;
  font-weight: 700;
  color: #f2f6ff;
}

.teacher-topic {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.live-pill {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  color: #b8fff0;
  background: rgba(34,195,166,0.12);
  border: 1px solid rgba(34,195,166,0.24);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty-chat {
  margin: auto;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  max-width: 28ch;
  line-height: 1.6;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 10px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(79,140,255,0.1);
  border: 1px solid rgba(79,140,255,0.18);
  font-size: 22px;
}

.message {
  display: flex;
  gap: 10px;
  max-width: 94%;
}

.message.student {
  margin-left: auto;
  flex-direction: row-reverse;
}

.message-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.message-body {
  min-width: 0;
  max-width: 100%;
}

.message-content {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.75;
  letter-spacing: 0.01em;
  word-break: break-word;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  color: #e8eefc;
}

/* Readable markdown inside chat bubbles */
.message-content :deep(p) {
  margin: 0 0 0.7em;
}
.message-content :deep(p:last-child) {
  margin-bottom: 0;
}
.message-content :deep(h1),
.message-content :deep(h2),
.message-content :deep(h3),
.message-content :deep(h4) {
  margin: 0.9em 0 0.4em;
  line-height: 1.35;
  color: #f5f8ff;
  font-weight: 700;
}
.message-content :deep(h1:first-child),
.message-content :deep(h2:first-child),
.message-content :deep(h3:first-child),
.message-content :deep(h4:first-child) {
  margin-top: 0;
}
.message-content :deep(h1) { font-size: 1.12em; }
.message-content :deep(h2) { font-size: 1.05em; }
.message-content :deep(h3) {
  font-size: 0.98em;
  color: #cfe0ff;
  padding-bottom: 0.2em;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.message-content :deep(h4) { font-size: 0.95em; color: #d7e4ff; }
.message-content :deep(ul),
.message-content :deep(ol) {
  margin: 0.35em 0 0.75em;
  padding-left: 1.25em;
}
.message-content :deep(li) {
  margin: 0.28em 0;
}
.message-content :deep(li::marker) {
  color: #8fb4ff;
}
.message-content :deep(strong) {
  color: #ffffff;
  font-weight: 700;
}
.message-content :deep(em) {
  color: #d7e6ff;
}
.message-content :deep(blockquote) {
  margin: 0.6em 0;
  padding: 0.45em 0.75em;
  border-left: 3px solid rgba(79,140,255,0.55);
  background: rgba(79,140,255,0.08);
  color: #d7e4ff;
  border-radius: 0 8px 8px 0;
}
.message-content :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255,255,255,0.08);
  margin: 0.9em 0;
}
.message-content :deep(a) {
  color: #9ec0ff;
  text-decoration: none;
}
.message-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  padding: 0.12em 0.38em;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.28);
  color: #d6e7ff;
  border: 1px solid rgba(255,255,255,0.06);
}
.message-content :deep(pre) {
  margin: 0.65em 0 0.85em;
  padding: 12px 14px;
  border-radius: 10px;
  overflow-x: auto;
  background: #0a101c;
  border: 1px solid rgba(120, 150, 210, 0.18);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}
.message-content :deep(pre code) {
  padding: 0;
  border: none;
  background: transparent;
  color: #dbe7ff;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre;
}
.message-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.6em 0;
  font-size: 0.92em;
}
.message-content :deep(th),
.message-content :deep(td) {
  border: 1px solid rgba(255,255,255,0.08);
  padding: 6px 8px;
  text-align: left;
}
.message-content :deep(th) {
  background: rgba(255,255,255,0.04);
}

.message.student .message-content {
  background: linear-gradient(135deg, rgba(79,140,255,0.92), rgba(61,116,223,0.96));
  border-color: transparent;
  color: #fff;
  box-shadow: 0 8px 18px rgba(61,116,223,0.18);
}
.message.student .message-content :deep(code),
.message.student .message-content :deep(pre) {
  background: rgba(0,0,0,0.18);
  border-color: rgba(255,255,255,0.12);
  color: #fff;
}
.message.student .message-content :deep(h1),
.message.student .message-content :deep(h2),
.message.student .message-content :deep(h3),
.message.student .message-content :deep(strong) {
  color: #fff;
}

.message-time {
  margin-top: 4px;
  font-size: 10px;
  color: var(--text-muted);
}

.message.student .message-time {
  text-align: right;
}

.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border);
  background: rgba(7, 11, 20, 0.45);
}

.chat-input {
  flex: 1;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: rgba(255,255,255,0.03);
  color: var(--text);
  padding: 10px 12px;
  outline: none;
  transition: 0.18s ease;
}

.chat-input:focus {
  border-color: rgba(79,140,255,0.45);
  box-shadow: 0 0 0 3px rgba(79,140,255,0.12);
}

.send-btn {
  min-height: 42px;
  padding-left: 16px;
  padding-right: 16px;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.quick-btn {
  border-radius: 999px;
  border: 1px solid rgba(79, 140, 255, 0.28);
  background: rgba(79, 140, 255, 0.1);
  color: #d7e6ff;
  font-size: 12px;
  line-height: 1;
  padding: 8px 12px;
  cursor: pointer;
  transition: 0.15s ease;
}

.quick-btn:hover:not(:disabled) {
  background: rgba(79, 140, 255, 0.18);
  border-color: rgba(79, 140, 255, 0.45);
  color: #fff;
}

.quick-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.thinking-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  background: rgba(79, 140, 255, 0.08);
  color: #c7dbff;
  font-size: 12px;
}

.stream-caret {
  display: inline-block;
  width: 7px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: rgba(79, 140, 255, 0.95);
  border-radius: 1px;
  animation: caret-blink 0.9s steps(1) infinite;
}

@keyframes caret-blink {
  0%, 45% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.message.streaming .message-content {
  min-height: 1.2em;
}

.cancel-stream-btn {
  margin-left: auto;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  color: #c9d4ef;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.cancel-stream-btn:hover {
  background: rgba(255,120,120,0.12);
  border-color: rgba(255,120,120,0.35);
  color: #ffd0d0;
}
</style>