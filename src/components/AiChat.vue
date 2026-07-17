<!-- AI 教学对话框组件 -->
<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import type { TeachingMessage } from '@/types/learning'
import { renderMessageContent } from '@/utils/markdown'

interface Props {
  messages: TeachingMessage[]
  kpTitle: string
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), { disabled: false })
const emit = defineEmits<{ send: [answer: string] }>()

const input = ref('')
const chatRef = ref<HTMLElement>()

const renderedMessages = computed(() =>
  props.messages.map((msg) => ({
    ...msg,
    html: renderMessageContent(msg.content),
  })),
)

watch(
  () => props.messages.length,
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

function getTypeIcon(type: string) {
  const icons: Record<string, string> = {
    text: '💬',
    code: '💻',
    diagram: '📊',
    question: '🤔',
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
      <div v-for="msg in renderedMessages" :key="msg.id" class="message" :class="msg.role">
        <div class="message-icon">{{ getTypeIcon(msg.type) }}</div>
        <div class="message-body">
          <div class="message-content" v-html="msg.html"></div>
          <div class="message-time">{{ new Date(msg.timestamp).toLocaleTimeString('zh-CN') }}</div>
        </div>
      </div>
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
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  max-width: 92%;
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
}

.message-content {
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  color: var(--text);
}

.message.student .message-content {
  background: linear-gradient(135deg, rgba(79,140,255,0.92), rgba(61,116,223,0.96));
  border-color: transparent;
  color: #fff;
  box-shadow: 0 8px 18px rgba(61,116,223,0.18);
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
</style>
