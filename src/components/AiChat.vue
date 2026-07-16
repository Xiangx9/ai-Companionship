<!-- AI 教学对话框组件 -->
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { TeachingMessage } from '@/types/learning'

interface Props {
  messages: TeachingMessage[]
  kpTitle: string
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), { disabled: false })
const emit = defineEmits<{ send: [answer: string] }>()

const input = ref('')
const chatRef = ref<HTMLElement>()

watch(() => props.messages.length, () => {
  nextTick(() => scrollToBottom())
})

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
  const icons: Record<string, string> = { text: '💬', code: '💻', diagram: '📊', question: '🤔', feedback: '📈' }
  return icons[type] ?? '💬'
}

function formatContent(content: string): string {
  return content.replace(/\n/g, '<br/>');
}
</script>

<template>
  <div class="ai-chat">
    <div class="chat-header">
      <span class="teacher-avatar">🧑‍🏫</span>
      <div>
        <div class="teacher-name">Learning Mentor</div>
        <div class="teacher-topic">{{ kpTitle }}</div>
      </div>
    </div>

    <div ref="chatRef" class="chat-messages">
      <div v-for="msg in props.messages" :key="msg.id" class="message" :class="msg.role">
        <div class="message-icon">{{ getTypeIcon(msg.type) }}</div>
        <div class="message-body">
          <div class="message-content" v-html="formatContent(msg.content)"></div>
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
      <button class="chat-send-btn" @click="sendMessage" :disabled="disabled || !input.trim()">发送</button>
    </div>
  </div>
</template>

<style scoped>
.ai-chat {
  @apply flex flex-col h-full bg-[#0f0f2a] rounded-xl border border-white/[0.06];
}
.chat-header {
  @apply flex items-center gap-3 p-3 sm:p-4 border-b border-white/[0.06];
}
.teacher-avatar {
  @apply text-[28px] sm:text-[32px];
}
.teacher-name {
  @apply text-xs sm:text-sm font-semibold text-white;
}
.teacher-topic {
  @apply text-[11px] sm:text-xs text-[#6c63ff];
}
.chat-messages {
  @apply flex-1 overflow-y-auto p-2.5 sm:p-4 flex flex-col gap-3;
}
.message {
  @apply flex gap-2.5 max-w-[85%] sm:max-w-[85%];
}
.message.teacher {
  @apply self-start;
}
.message.student {
  @apply self-end flex-row-reverse;
}
.message-icon {
  @apply text-base sm:text-lg flex-shrink-0 mt-0.5;
}
.message-body {
  @apply flex flex-col gap-1;
}
.message-content {
  @apply text-xs sm:text-sm leading-relaxed text-[#ddd] whitespace-pre-wrap break-words;
}
.message-time {
  @apply text-[10px] text-[#555];
}
.chat-input-area {
  @apply flex gap-2 p-2.5 sm:p-3 border-t border-white/[0.06];
}
.chat-input {
  @apply flex-1 px-3.5 py-2.5 sm:py-3 border border-[#2a2a4a] rounded-lg bg-[#1a1a2e] text-[#e0e0e0] text-sm sm:text-base outline-none;
}
.chat-input:focus {
  @apply border-[#6c63ff];
}
.chat-input:disabled {
  @apply opacity-50;
}
.chat-send-btn {
  @apply px-4 sm:px-5 py-2.5 sm:py-3 border-0 rounded-lg bg-[#6c63ff] text-white text-sm sm:text-base cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#5a52d4];
}
</style>

