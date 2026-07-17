<!-- AI 情感陪伴 -->
<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { chatWithCompanion } from '@/services/aiEngine'
import { renderMessageContent } from '@/utils/markdown'
import { safeGetJson, safeSetJson, StorageQuotaError } from '@/utils/storage'
import { toastError } from '@/utils/toast'

interface CompanionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const STORAGE_KEY = 'aios_companion_chat'
const router = useRouter()

const messages = ref<CompanionMessage[]>([])
const input = ref('')
const loading = ref(false)
const error = ref('')
const chatRef = ref<HTMLElement>()

const quickPrompts = [
  '学累了，只想发发呆',
  '有点焦虑，想聊聊',
  '今天状态不太好',
  '陪我放松一下吧',
]

const renderedMessages = computed(() =>
  messages.value.map((msg) => ({
    ...msg,
    html: renderMessageContent(msg.content),
  })),
)

function loadHistory() {
  const parsed = safeGetJson<CompanionMessage[]>(STORAGE_KEY, [])
  messages.value = Array.isArray(parsed) ? parsed.slice(-80) : []
}

function saveHistory() {
  try {
    safeSetJson(STORAGE_KEY, messages.value.slice(-80))
  } catch (err) {
    if (err instanceof StorageQuotaError) {
      messages.value = messages.value.slice(-30)
      try {
        safeSetJson(STORAGE_KEY, messages.value)
      } catch {
        toastError(err.message)
      }
      return
    }
    throw err
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (chatRef.value) chatRef.value.scrollTop = chatRef.value.scrollHeight
  })
}

function clearChat() {
  if (!confirm('清空陪伴聊天记录？')) return
  messages.value = []
  localStorage.removeItem(STORAGE_KEY)
  error.value = ''
}

async function send(text?: string) {
  const content = (text ?? input.value).trim()
  if (!content || loading.value) return

  error.value = ''
  input.value = ''

  const userMsg: CompanionMessage = {
    id: 'u-' + Date.now(),
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  }
  messages.value.push(userMsg)
  saveHistory()
  scrollToBottom()

  loading.value = true
  try {
    const history = messages.value
      .filter((m) => m.id !== userMsg.id)
      .map((m) => ({ role: m.role, content: m.content }))
    const reply = await chatWithCompanion(history, content)
    messages.value.push({
      id: 'a-' + Date.now(),
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    })
    saveHistory()
    scrollToBottom()
  } catch (e) {
    const msg = e instanceof Error ? e.message : '发送失败，请稍后重试'
    error.value = msg
    toastError(msg)
    scrollToBottom()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadHistory()
  scrollToBottom()
})

watch(
  () => messages.value.length,
  () => scrollToBottom(),
)
</script>

<template>
  <div class="companion-page">
    <div class="chat-shell surface">
      <div class="shell-glow" aria-hidden="true"></div>

      <header class="top-bar">
        <div class="title-block">
          <div class="avatar">
            <span>🌙</span>
            <i class="online-dot" aria-hidden="true"></i>
          </div>
          <div>
            <h1>星语 · 情感陪伴</h1>
            <p>不赶进度 · 温柔倾听 · 本地会话</p>
          </div>
        </div>
        <div class="top-actions">
          <button class="btn btn-ghost" type="button" @click="router.push('/')">返回首页</button>
          <button class="btn btn-secondary" type="button" :disabled="!messages.length" @click="clearChat">清空</button>
        </div>
      </header>

      <div ref="chatRef" class="messages">
        <div v-if="!messages.length" class="welcome">
          <div class="welcome-card">
            <div class="welcome-icon">🌙</div>
            <h2>我在这儿</h2>
            <p>学累了、焦虑了，或者只是想找人说说话，都可以从下面开始。</p>
            <div class="quick-list">
              <button
                v-for="prompt in quickPrompts"
                :key="prompt"
                type="button"
                class="quick-btn"
                :disabled="loading"
                @click="send(prompt)"
              >
                {{ prompt }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-for="msg in renderedMessages"
          :key="msg.id"
          class="msg"
          :class="msg.role"
        >
          <div v-if="msg.role === 'assistant'" class="msg-avatar" aria-hidden="true">🌙</div>
          <div class="bubble">
            <div class="bubble-content" v-html="msg.html"></div>
            <div class="bubble-time">{{ new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</div>
          </div>
        </div>

        <div v-if="loading" class="msg assistant">
          <div class="msg-avatar" aria-hidden="true">🌙</div>
          <div class="bubble typing">
            <span></span><span></span><span></span>
          </div>
        </div>

        <p v-if="error" class="error-text">{{ error }}</p>
      </div>

      <div class="composer">
        <div v-if="messages.length" class="quick-inline">
          <button
            v-for="prompt in quickPrompts"
            :key="prompt"
            type="button"
            class="quick-chip"
            :disabled="loading"
            @click="send(prompt)"
          >
            {{ prompt }}
          </button>
        </div>
        <div class="input-row">
          <textarea
            v-model="input"
            class="composer-input"
            rows="1"
            placeholder="跟星语说点什么..."
            :disabled="loading"
            @keydown.enter.exact.prevent="send()"
          />
          <button class="btn btn-primary" type="button" :disabled="loading || !input.trim()" @click="send()">
            发送
          </button>
        </div>
        <p class="hint">Enter 发送 · 对话保存在本地浏览器</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.companion-page {
  min-height: calc(100vh - var(--nav-h));
  padding: 20px;
  display: flex;
  justify-content: center;
}

.chat-shell {
  width: min(880px, 100%);
  min-height: calc(100vh - var(--nav-h) - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(79,140,255,0.08), transparent 18%),
    linear-gradient(180deg, rgba(14,22,38,0.96), rgba(10,16,28,0.98));
}

.shell-glow {
  position: absolute;
  top: -80px;
  right: -40px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(79,140,255,0.16), transparent 70%);
  pointer-events: none;
}

.top-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  background: rgba(8, 12, 22, 0.28);
}

.title-block {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.avatar {
  position: relative;
  width: 46px;
  height: 46px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background:
    linear-gradient(145deg, rgba(79,140,255,0.2), rgba(34,195,166,0.1));
  border: 1px solid rgba(79,140,255,0.24);
  flex-shrink: 0;
  font-size: 20px;
}

.online-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #22c3a6;
  border: 2px solid #0c1220;
  box-shadow: 0 0 0 3px rgba(34,195,166,0.12);
}

.title-block h1 {
  margin: 0;
  font-size: 16px;
  color: #f3f7ff;
}

.title-block p {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.top-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.messages {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.welcome {
  margin: auto;
  width: 100%;
  max-width: 460px;
}

.welcome-card {
  text-align: center;
  padding: 28px 20px;
  border-radius: 18px;
  border: 1px solid rgba(79,140,255,0.16);
  background:
    linear-gradient(180deg, rgba(79,140,255,0.08), transparent 60%),
    rgba(255,255,255,0.02);
}

.welcome-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  font-size: 26px;
  background: rgba(79,140,255,0.12);
  border: 1px solid rgba(79,140,255,0.2);
}

.welcome h2 {
  margin: 0 0 8px;
  font-size: 20px;
  color: #f4f7ff;
}

.welcome p {
  margin: 0 0 18px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.quick-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.quick-btn,
.quick-chip {
  border: 1px solid rgba(79,140,255,0.22);
  background: rgba(79,140,255,0.08);
  color: #d7e6ff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: 0.18s ease;
}

.quick-btn:hover:not(:disabled),
.quick-chip:hover:not(:disabled) {
  background: rgba(79,140,255,0.14);
  transform: translateY(-1px);
}

.quick-btn:disabled,
.quick-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.msg {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.msg.user {
  justify-content: flex-end;
}

.msg.assistant {
  justify-content: flex-start;
}

.msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(79,140,255,0.12);
  border: 1px solid rgba(79,140,255,0.18);
  font-size: 13px;
  flex-shrink: 0;
}

.bubble {
  max-width: min(78%, 560px);
  padding: 12px 14px;
  border-radius: 16px;
}

.msg.user .bubble {
  color: #f5f8ff;
  background: linear-gradient(135deg, #5a93ff, #3d74df);
  border-bottom-right-radius: 6px;
  box-shadow: 0 10px 24px rgba(61,116,223,0.22);
}

.msg.assistant .bubble {
  color: var(--text);
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  border-bottom-left-radius: 6px;
}

.bubble-content {
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
}

.bubble-content :deep(p) {
  margin: 0.35em 0;
}

.bubble-time {
  margin-top: 6px;
  font-size: 10px;
  opacity: 0.65;
}

.msg.user .bubble-time {
  text-align: right;
}

.typing {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 56px;
  min-height: 24px;
}

.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #9ec0ff;
  animation: bounce 1.2s infinite ease-in-out;
}

.typing span:nth-child(2) { animation-delay: 0.15s; }
.typing span:nth-child(3) { animation-delay: 0.3s; }

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
  40% { transform: translateY(-4px); opacity: 1; }
}

.error-text {
  margin: 0;
  text-align: center;
  color: #ff8b97;
  font-size: 12px;
}

.composer {
  position: relative;
  border-top: 1px solid var(--border);
  padding: 14px 16px 16px;
  background: rgba(7, 11, 20, 0.5);
}

.quick-inline {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;
}

.quick-chip {
  flex-shrink: 0;
}

.input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.composer-input {
  flex: 1;
  min-height: 46px;
  max-height: 120px;
  resize: none;
  border-radius: 12px;
  border: 1px solid var(--border-strong);
  background: rgba(255,255,255,0.03);
  color: var(--text);
  padding: 12px 14px;
  outline: none;
  transition: 0.18s ease;
}

.composer-input:focus {
  border-color: rgba(79,140,255,0.45);
  box-shadow: 0 0 0 3px rgba(79,140,255,0.12);
}

.hint {
  margin: 8px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .companion-page {
    padding: 10px;
  }
  .chat-shell {
    min-height: calc(100vh - var(--nav-h) - 20px);
  }
  .top-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .top-actions {
    justify-content: flex-end;
  }
  .title-block p {
    display: none;
  }
  .bubble {
    max-width: 88%;
  }
}
</style>
