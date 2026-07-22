<!-- AI Learning OS - AI 连接设置 -->
<script setup lang="ts">
import { onMounted, ref, computed, watch, nextTick } from 'vue'
import { useSettingsStore } from '@/store/settings'
import { toastError, toastSuccess, toastWarning } from '@/utils/toast'
import { maskApiKey, DEFAULT_AI_MODEL, normalizeBaseUrl, inheritsEnvBase, originOfBaseUrl } from '@/services/aiConfig'

const store = useSettingsStore()
const showKey = ref(false)
const showHelp = ref(false)
const showAdvanced = ref(false)
const manualModel = ref('')
const modelFilter = ref('')
const snapshot = ref({ baseUrl: '', apiKey: '', model: '' })
const lastOkAt = ref('')
const apiKeyInput = ref<HTMLInputElement | null>(null)
const baseUrlInput = ref<HTMLInputElement | null>(null)
const lastNormalizedBase = ref('')

type PresetId = 'env' | 'agnes' | 'hetaosu' | 'custom'
const presets: { id: PresetId; label: string; hint: string; baseUrl?: string }[] = [
  { id: 'env', label: '当前默认', hint: '沿用环境变量' },
  { id: 'agnes', label: 'Agnes', hint: '官方网关', baseUrl: 'https://apihub.agnes-ai.com/v1' },
  { id: 'hetaosu', label: '河涛素', hint: '需 /v1 前缀', baseUrl: 'https://gy.hetaosu.xyz/v1' },
  { id: 'custom', label: '自定义', hint: '手动填写地址' },
]

const activePreset = computed<PresetId>(() => {
  if (!store.baseUrl.trim()) return 'env'
  const cur = normalizeBaseUrl(store.baseUrl)
  if (cur === normalizeBaseUrl('https://apihub.agnes-ai.com/v1')) return 'agnes'
  if (cur === normalizeBaseUrl('https://gy.hetaosu.xyz/v1')) return 'hetaosu'
  return 'custom'
})

const modelOptions = computed(() => {
  const set = new Set<string>()
  // Only list models from the current gateway + the selected model.
  // Do not force-inject DEFAULT_AI_MODEL from another provider.
  for (const m of store.availableModels) if (m) set.add(m)
  if (store.model) set.add(store.model)
  return Array.from(set)
})

const filteredModels = computed(() => {
  const q = modelFilter.value.trim().toLowerCase()
  if (!q) return modelOptions.value
  return modelOptions.value.filter((m) => m.toLowerCase().includes(q))
})

const modelsSourceHost = computed(() => {
  const base = store.modelsBaseUrl || ''
  if (!base) return ''
  try {
    return new URL(base).host
  } catch {
    return base
  }
})

const modelsMatchCurrent = computed(() => {
  if (!store.modelsBaseUrl) return false
  return normalizeBaseUrl(store.modelsBaseUrl) === normalizeBaseUrl(store.effective.baseUrl)
})

const dirty = computed(() => {
  return (
    store.baseUrl.trim() !== snapshot.value.baseUrl ||
    store.apiKey.trim() !== snapshot.value.apiKey ||
    store.model.trim() !== snapshot.value.model
  )
})

const status = computed(() => {
  if (store.testing || store.listing) {
    return {
      tone: 'busy' as const,
      title: '正在连接…',
      desc: store.listing ? '正在拉取可用模型列表' : '正在验证接口与密钥',
    }
  }
  if (store.lastError) {
    return { tone: 'bad' as const, title: '连接失败', desc: shortError(store.lastError) }
  }
  if (!store.hasKey) {
    return {
      tone: 'warn' as const,
      title: '还差一步',
      desc: store.usingEnvBase
        ? '填入 API 密钥后即可测试连接'
        : '当前服务需要单独的 API 密钥（不会自动沿用其他网关的密钥）',
    }
  }
  if (store.lastMessage || lastOkAt.value) {
    return {
      tone: 'ok' as const,
      title: '可以开始学习',
      desc: '当前模型 ' + store.effective.model + (lastOkAt.value ? ' · 上次成功 ' + lastOkAt.value : ''),
    }
  }
  return {
    tone: 'idle' as const,
    title: '等待配置',
    desc: '选择服务商、填密钥，点「测试并保存」',
  }
})

const keyStatusText = computed(() => {
  if (store.apiKey.trim()) return '本机已填写 · ' + maskApiKey(store.apiKey)
  if (store.usingEnvKey) return '继承环境变量 · ' + maskApiKey(store.envDefaults.apiKey)
  if (store.envDefaults.apiKey && !inheritsEnvBase(store.baseUrl, store.envDefaults.baseUrl)) {
    return '当前地址与默认不同，需填写该服务商自己的密钥'
  }
  return '尚未配置密钥'
})

function shortError(msg: string) {
  const m = msg.trim()
  if (/INVALID_API_KEY|Invalid API key|无效的令牌|令牌/i.test(m)) {
    return 'API 密钥无效或属于其他服务商，请填写当前地址对应的密钥'
  }
  if (/API_KEY_REQUIRED|API key is required/i.test(m)) return '该服务需要有效的 API 密钥'
  if (/Failed to fetch|NetworkError|network|CORS|跨域/i.test(m)) {
    return '网络或跨域受限：请用 npm run dev 本地运行（已启用代理）'
  }
  if (/timeout|超时/i.test(m)) return '请求超时，请检查地址或网络'
  if (/404|Not Found/i.test(m)) return '地址可能不对，试试补上 /v1'
  if (m.length > 100) return m.slice(0, 100) + '…'
  return m
}

function captureSnapshot() {
  snapshot.value = {
    baseUrl: store.baseUrl.trim(),
    apiKey: store.apiKey.trim(),
    model: store.model.trim(),
  }
}

function markOkNow() {
  lastOkAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  try {
    localStorage.setItem('aios_ai_last_ok_at', lastOkAt.value)
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  store.init()
  manualModel.value = store.model
  lastNormalizedBase.value = normalizeBaseUrl(store.baseUrl || store.effective.baseUrl || '')
  captureSnapshot()
  try {
    lastOkAt.value = localStorage.getItem('aios_ai_last_ok_at') || ''
  } catch {
    lastOkAt.value = ''
  }
})

watch(
  () => store.model,
  (v) => {
    // Keep manual input in sync when list refresh picks a preferred model
    if (v) manualModel.value = v
  },
)


async function focusKey() {
  await nextTick()
  apiKeyInput.value?.focus()
  apiKeyInput.value?.select()
}

async function applyPreset(id: PresetId) {
  lastOkAt.value = ''
  try { localStorage.removeItem('aios_ai_last_ok_at') } catch { /* ignore */ }

  if (id === 'env') {
    const result = store.applyConnectionPreset({ kind: 'env', preferredModel: DEFAULT_AI_MODEL })
    manualModel.value = store.model
    lastNormalizedBase.value = normalizeBaseUrl(store.baseUrl || store.effective.baseUrl || '')
    // Do not captureSnapshot: leave dirty until user tests/saves
    toastSuccess(
      result.needsKey
        ? '已切换为环境默认地址，请确认密钥'
        : '已切换为环境默认地址',
    )
    if (result.needsKey) await focusKey()
    return
  }

  if (id === 'custom') {
    store.applyConnectionPreset({ kind: 'custom' })
    manualModel.value = store.model
    lastNormalizedBase.value = normalizeBaseUrl(store.baseUrl || store.effective.baseUrl || '')
    toastWarning('请填写自定义服务地址与对应密钥')
    await nextTick()
    baseUrlInput.value?.focus()
    return
  }

  const p = presets.find((x) => x.id === id)
  if (!p?.baseUrl) return
  const result = store.applyConnectionPreset({
    kind: 'named',
    baseUrl: p.baseUrl,
    preferredModel: id === 'agnes' ? DEFAULT_AI_MODEL : undefined,
  })
  manualModel.value = store.model
  lastNormalizedBase.value = normalizeBaseUrl(store.baseUrl || store.effective.baseUrl || '')
  if (result.keyCleared || result.needsKey) {
    toastWarning('已切换到 ' + p.label + '，请填写该服务商自己的 API 密钥后再刷新模型')
    await focusKey()
  } else {
    toastSuccess('已切换到 ' + p.label)
  }
}

function onBlurBaseUrl() {
  const raw = store.baseUrl.trim()
  if (!raw) {
    if (lastNormalizedBase.value) {
      store.clearConnectionState({ clearModels: true })
      lastOkAt.value = ''
      try { localStorage.removeItem('aios_ai_last_ok_at') } catch { /* ignore */ }
    }
    lastNormalizedBase.value = ''
    return
  }
  let next = raw
  if (!/^https?:\/\//i.test(next)) next = 'https://' + next
  next = normalizeBaseUrl(next)
  if (/^https?:\/\/[^/]+$/i.test(next)) next = next + '/v1'
  const prev = lastNormalizedBase.value || normalizeBaseUrl(store.baseUrl)
  const prevOrigin = originOfBaseUrl(prev)
  const nextOrigin = originOfBaseUrl(next)
  const hostChanged = Boolean(prevOrigin && nextOrigin && prevOrigin !== nextOrigin)
  store.baseUrl = next
  lastNormalizedBase.value = next
  if (prev && prev !== next) {
    store.clearConnectionState({ clearModels: true })
    // Different gateway host: do not reuse the previous provider's key/models.
    if (hostChanged) {
      store.apiKey = ''
    }
    // Address host changed: drop previous gateway model id
    if (!inheritsEnvBase(next, store.envDefaults.baseUrl)) {
      store.model = ''
      manualModel.value = ''
    } else {
      store.model = DEFAULT_AI_MODEL
      manualModel.value = DEFAULT_AI_MODEL
    }
    lastOkAt.value = ''
    try { localStorage.removeItem('aios_ai_last_ok_at') } catch { /* ignore */ }
    toastWarning(
      hostChanged
        ? '服务商已切换，请填写新地址对应的密钥后再刷新模型'
        : '服务地址已变更，请重新刷新模型或测试连接',
    )
  }
}

function selectModel(name: string) {
  store.model = name
  manualModel.value = name
  modelFilter.value = ''
}

function applyManualModel() {
  const name = manualModel.value.trim()
  if (!name) {
    toastWarning('请输入模型名称')
    return
  }
  selectModel(name)
  if (!store.availableModels.includes(name)) {
    store.availableModels = [...store.availableModels, name]
  }
  toastSuccess('已选择 ' + name)
}

function saveOnly() {
  onBlurBaseUrl()
  const ok = store.save()
  if (ok) {
    captureSnapshot()
    toastSuccess('设置已保存')
  } else {
    toastError(store.lastError || '保存失败')
  }
  return ok
}

function reset() {
  if (!confirm('确定恢复为环境变量默认配置？将清除本机已保存的 AI 设置。')) return
  store.resetToEnv()
  manualModel.value = store.model
  lastOkAt.value = ''
  try {
    localStorage.removeItem('aios_ai_last_ok_at')
  } catch {
    /* ignore */
  }
  captureSnapshot()
  toastSuccess('已恢复默认')
}

async function testAndSave() {
  onBlurBaseUrl()
  if (!store.effective.apiKey) {
    toastWarning(
      store.baseUrl.trim() && !inheritsEnvBase(store.baseUrl, store.envDefaults.baseUrl)
        ? '当前服务需要单独密钥，请先填写'
        : '请先填写 API 密钥',
    )
    await focusKey()
    return
  }
  try {
    await store.testConnection()
    if (store.model) manualModel.value = store.model
    store.save()
    captureSnapshot()
    markOkNow()
    toastSuccess(store.lastMessage || '连接成功，设置已保存')
  } catch (err) {
    const aborted =
      err && typeof err === 'object' && (
        (err as { name?: string }).name === 'AbortError' ||
        /aborted|AbortError/i.test(err instanceof Error ? err.message : String(err))
      )
    if (aborted) return
    toastError(store.lastError || '连接失败')
  }
}

async function fetchModels() {
  onBlurBaseUrl()
  if (!store.effective.apiKey) {
    toastWarning(
      store.baseUrl.trim() && !inheritsEnvBase(store.baseUrl, store.envDefaults.baseUrl)
        ? '当前服务需要单独密钥，请先填写该服务商密钥后再刷新模型'
        : '请先填写 API 密钥',
    )
    await focusKey()
    return
  }
  const targetHost = originOfBaseUrl(store.effective.baseUrl) || store.effective.baseUrl
  try {
    const models = await store.fetchModels()
    if (!models.length && !store.lastMessage) {
      // aborted / superseded by a newer request
      if (store.listing) return
      toastWarning('模型列表请求已取消，请再点一次刷新')
      return
    }
    if (store.model) manualModel.value = store.model
    // Refresh list is a connectivity signal; persist so restart keeps models
    store.save()
    captureSnapshot()
    markOkNow()
    toastSuccess(store.lastMessage || ('已从 ' + targetHost + ' 获取模型列表'))
  } catch {
    lastOkAt.value = ''
    try { localStorage.removeItem('aios_ai_last_ok_at') } catch { /* ignore */ }
    toastError(store.lastError || ('获取模型失败：' + targetHost))
  }
}

function copyText(text: string) {
  if (!text) {
    toastWarning('暂无可复制内容')
    return
  }
  if (!navigator.clipboard?.writeText) {
    toastWarning('当前环境不支持一键复制')
    return
  }
  navigator.clipboard.writeText(text).then(
    () => toastSuccess('已复制'),
    () => toastWarning('复制失败，请手动选择'),
  )
}
</script>

<template>
  <div class="settings-page">
    <header class="page-header">
      <div class="header-copy">
        <div class="eyebrow">本地配置 · 仅保存在本机</div>
        <h1>AI 连接</h1>
        <p class="page-sub">三步搞定：选服务商 → 填密钥 → 测试并保存。之后学习流程会自动用这里的配置。</p>
      </div>
      <div class="status-card" :class="'tone-' + status.tone" aria-live="polite">
        <div class="status-dot" aria-hidden="true"></div>
        <div class="status-text">
          <strong>{{ status.title }}</strong>
          <span>{{ status.desc }}</span>
        </div>
        <span v-if="dirty" class="dirty-pill">未保存</span>
      </div>
    </header>

    <section class="settings-card surface">
      <div class="section-head">
        <h2>1. 连接服务</h2>
        <p>先选常用服务商，再填密钥；地址会自动补全 https 与 /v1。</p>
      </div>

      <div class="preset-row" role="list">
        <button
          v-for="p in presets"
          :key="p.id"
          type="button"
          class="preset-chip"
          :class="{ active: activePreset === p.id }"
          role="listitem"
          @click="applyPreset(p.id)"
        >
          <span class="preset-label">{{ p.label }}</span>
          <span class="preset-hint">{{ p.hint }}</span>
        </button>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="baseUrl">服务地址</label>
          <button class="linkish" type="button" @click="copyText(store.effective.baseUrl)">复制生效地址</button>
        </div>
        <input
          id="baseUrl"
          ref="baseUrlInput"
          v-model="store.baseUrl"
          class="field-input"
          type="url"
          spellcheck="false"
          autocomplete="off"
          :placeholder="store.envDefaults.baseUrl || 'https://api.example.com/v1'"
          @blur="onBlurBaseUrl"
        />
        <p class="field-hint">
          <template v-if="store.usingEnvBase">留空则使用环境默认：{{ store.envDefaults.baseUrl }}</template>
          <template v-else>当前生效：{{ store.effective.baseUrl }}</template>
          · 需包含 <code>/v1</code> 前缀
        </p>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="apiKey">API 密钥</label>
          <button class="linkish" type="button" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
        </div>
        <div class="key-row">
          <input
            id="apiKey"
            ref="apiKeyInput"
            v-model="store.apiKey"
            class="field-input"
            :type="showKey ? 'text' : 'password'"
            spellcheck="false"
            autocomplete="off"
            placeholder="粘贴服务商提供的密钥"
          />
        </div>
        <p class="field-hint">{{ keyStatusText }} · 仅存本机浏览器，请勿在公共设备填写</p>
      </div>
    </section>

    <section class="settings-card surface">
      <div class="section-head between">
        <div>
          <h2>2. 选择模型</h2>
          <p>可从列表点选，也可手动输入网关支持的模型名。</p>
        </div>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="store.listing || !store.effective.apiKey"
          @click="fetchModels"
        >
          <span v-if="store.listing" class="spinner"></span>
          {{ store.listing ? '获取中…' : '刷新模型列表' }}
        </button>
      </div>

      <div v-if="modelOptions.length" class="model-toolbar">
        <input
          v-model="modelFilter"
          class="field-input model-search"
          type="search"
          placeholder="搜索模型名…"
          spellcheck="false"
        />
        <div class="current-model" :title="store.effective.model">
          当前 <strong>{{ store.effective.model || '未选择' }}</strong>
          <span v-if="modelsSourceHost" class="models-source" :class="{ mismatch: !modelsMatchCurrent }">
            · 列表来自 {{ modelsSourceHost }}
          </span>
        </div>
      </div>

      <div v-if="filteredModels.length" class="model-grid" role="listbox" aria-label="可用模型">
        <button
          v-for="m in filteredModels"
          :key="m"
          type="button"
          class="model-chip"
          :class="{ active: store.model === m }"
          role="option"
          :aria-selected="store.model === m"
          :title="m"
          @click="selectModel(m)"
        >
          {{ m }}
        </button>
      </div>
      <div v-else class="empty-models">
        <p v-if="modelFilter.trim()">没有匹配「{{ modelFilter.trim() }}」的模型，可清空搜索或手动输入。</p>
        <p v-else>还没有模型列表。填好密钥后点「刷新模型列表」，或直接在下方手动输入。</p>
      </div>

      <div class="manual-box">
        <label for="manualModel">手动输入模型名</label>
        <div class="manual-row">
          <input
            id="manualModel"
            v-model="manualModel"
            class="field-input"
            type="text"
            spellcheck="false"
            :placeholder="'例如 ' + DEFAULT_AI_MODEL"
            @keydown.enter.prevent="applyManualModel"
          />
          <button class="btn btn-ghost" type="button" @click="applyManualModel">使用</button>
        </div>
      </div>
    </section>

    <section class="action-bar surface">
      <div class="action-copy">
        <strong>{{ dirty ? '有未保存的修改' : '配置已同步' }}</strong>
        <span>建议用「测试并保存」，确认能通再开始学习</span>
      </div>
      <div class="action-btns">
        <button class="btn btn-ghost" type="button" @click="reset">恢复默认</button>
        <button class="btn btn-secondary" type="button" :disabled="store.saving" @click="saveOnly">
          {{ store.saving ? '保存中…' : '仅保存' }}
        </button>
        <button
          class="btn btn-primary"
          type="button"
          :disabled="store.testing || !store.effective.apiKey"
          @click="testAndSave"
        >
          <span v-if="store.testing" class="spinner"></span>
          {{ store.testing ? '测试中…' : '测试并保存' }}
        </button>
      </div>
    </section>

    <div v-if="store.lastError" class="status-panel error" role="alert">
      <div class="status-panel-title">连接出了点问题</div>
      <p>{{ shortError(store.lastError) }}</p>
      <details v-if="store.lastError.length > 40">
        <summary>查看技术详情</summary>
        <pre>{{ store.lastError }}</pre>
      </details>
    </div>
    <div v-else-if="store.lastMessage" class="status-panel ok" role="status">
      {{ store.lastMessage }}
    </div>

    <section class="settings-card surface soft-note">
      <button class="help-toggle" type="button" @click="showHelp = !showHelp">
        <span>使用说明与排错</span>
        <span class="chev">{{ showHelp ? '收起' : '展开' }}</span>
      </button>
      <div v-if="showHelp" class="help-body">
        <ul>
          <li>优先级：本机设置 > <code>.env.local</code> 环境变量 > 内置默认</li>
          <li>服务需兼容 OpenAI 接口；地址一般带 <code>/v1</code>（如河涛素：<code>https://gy.hetaosu.xyz/v1</code>）</li>
          <li>开发环境（<code>npm run dev</code>）会走本地代理，避免浏览器跨域拦截</li>
          <li>当前生效地址：<code>{{ store.effective.baseUrl }}</code></li>
          <li>当前生效模型：<code>{{ store.effective.model }}</code></li>
          <li>密钥状态：{{ store.hasKey ? '已配置' : '未配置' }}</li>
        </ul>
        <button class="linkish" type="button" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? '收起技术细节' : '展开技术细节' }}
        </button>
        <ul v-if="showAdvanced" class="tech-list">
          <li>对话：<code>POST /chat/completions</code></li>
          <li>模型列表：<code>GET /models</code>（可选；不支持时可手动填模型名）</li>
          <li>开发代理路径：<code>/__ai_proxy</code></li>
        </ul>
      </div>
    </section>
  </div>
</template>
<style scoped>
.settings-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 28px 20px 56px;
}
.page-header { display: grid; gap: 14px; margin-bottom: 18px; }
.eyebrow { font-size: 12px; color: var(--text-muted); letter-spacing: 0.04em; margin-bottom: 6px; }
.page-header h1 { margin: 0 0 8px; font-size: 28px; color: #f3f7ff; }
.page-sub { margin: 0; color: var(--text-secondary); line-height: 1.6; font-size: 14px; }
.status-card {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  border-radius: 14px; border: 1px solid var(--border); background: rgba(255, 255, 255, 0.03);
}
.status-dot {
  width: 10px; height: 10px; border-radius: 999px; flex-shrink: 0;
  background: var(--text-muted); box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.12);
}
.tone-ok .status-dot { background: #22c3a6; box-shadow: 0 0 0 4px rgba(34, 195, 166, 0.16); }
.tone-ok { border-color: rgba(34, 195, 166, 0.28); background: rgba(34, 195, 166, 0.08); }
.tone-warn .status-dot { background: #f0b429; box-shadow: 0 0 0 4px rgba(240, 180, 41, 0.16); }
.tone-warn { border-color: rgba(240, 180, 41, 0.28); background: rgba(240, 180, 41, 0.08); }
.tone-bad .status-dot { background: #ff5d6c; box-shadow: 0 0 0 4px rgba(255, 93, 108, 0.16); }
.tone-bad { border-color: rgba(255, 93, 108, 0.28); background: rgba(255, 93, 108, 0.08); }
.tone-busy .status-dot {
  background: #5a93ff; box-shadow: 0 0 0 4px rgba(79, 140, 255, 0.16);
  animation: pulse 1s ease-in-out infinite;
}
.tone-busy { border-color: rgba(79, 140, 255, 0.28); background: rgba(79, 140, 255, 0.08); }
.status-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.status-text strong { font-size: 14px; color: #f3f7ff; }
.status-text span { font-size: 12px; color: var(--text-secondary); line-height: 1.45; }
.dirty-pill {
  flex-shrink: 0; font-size: 11px; font-weight: 700; color: #ffe6a8;
  border: 1px solid rgba(240, 180, 41, 0.3); background: rgba(240, 180, 41, 0.12);
  border-radius: 999px; padding: 4px 10px;
}
.settings-card { padding: 20px; margin-bottom: 14px; }
.section-head { margin-bottom: 14px; }
.section-head.between { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.section-head h2 { margin: 0 0 4px; font-size: 16px; color: #f3f7ff; }
.section-head p { margin: 0; font-size: 12px; color: var(--text-muted); }
.preset-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
.preset-chip {
  text-align: left; border-radius: 12px; border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03); color: var(--text-secondary);
  padding: 10px 12px; cursor: pointer; transition: 0.18s ease;
}
.preset-chip:hover { border-color: rgba(79, 140, 255, 0.35); color: var(--text); }
.preset-chip.active {
  color: #e8f0ff; border-color: rgba(79, 140, 255, 0.4);
  background: rgba(79, 140, 255, 0.14); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
.preset-label { display: block; font-size: 13px; font-weight: 700; }
.preset-hint { display: block; margin-top: 2px; font-size: 11px; color: var(--text-muted); }
.field { margin-bottom: 16px; }
.field:last-child { margin-bottom: 0; }
.label-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.field label, .manual-box label { display: block; font-size: 13px; font-weight: 600; color: #dce9ff; }
.linkish { border: 0; background: transparent; color: #8eb4ff; font-size: 12px; cursor: pointer; padding: 0; }
.linkish:hover { color: #c9dbff; text-decoration: underline; }
.field-input {
  width: 100%; border-radius: 12px; border: 1px solid var(--border-strong);
  background: rgba(0, 0, 0, 0.22); color: var(--text); padding: 11px 14px;
  outline: none; transition: 0.18s ease;
}
.field-input:focus { border-color: rgba(79, 140, 255, 0.55); box-shadow: var(--ring); }
.field-hint { margin: 8px 0 0; font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.field-hint code, .help-body code { color: #9ec0ff; font-size: 11px; }
.key-row, .manual-row { display: flex; gap: 10px; align-items: center; }
.key-row .field-input, .manual-row .field-input { flex: 1; min-width: 0; }
.model-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.model-search { flex: 1; }
.current-model {
  flex-shrink: 0; font-size: 12px; color: var(--text-muted); max-width: 42%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.current-model strong { color: #c9dbff; font-weight: 700; }
.model-grid {
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;
  max-height: 180px; overflow: auto; padding: 2px;
}
.model-chip {
  border-radius: 999px; border: 1px solid var(--border); background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary); padding: 7px 12px; font-size: 12px; cursor: pointer;
  transition: 0.16s ease; max-width: 100%; overflow: hidden; text-overflow: ellipsis;
}
.model-chip:hover { color: var(--text); border-color: rgba(79, 140, 255, 0.35); }
.model-chip.active {
  color: #e8f0ff; border-color: rgba(79, 140, 255, 0.42); background: rgba(79, 140, 255, 0.16);
}
.empty-models {
  margin-bottom: 12px; padding: 14px; border-radius: 12px;
  border: 1px dashed rgba(148, 163, 184, 0.22); color: var(--text-muted); font-size: 13px;
}
.empty-models p { margin: 0; }
.models-source { margin-left: 0.35rem; opacity: 0.72; font-size: 0.85em; }
.models-source.mismatch { color: #b45309; opacity: 1; }
.manual-box { padding-top: 4px; }
.manual-box label { margin-bottom: 8px; }
.action-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 14px 16px; margin-bottom: 14px; position: sticky; bottom: 12px; z-index: 5;
  backdrop-filter: blur(12px); background: rgba(14, 22, 38, 0.92);
}
.action-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.action-copy strong { font-size: 13px; color: #f3f7ff; }
.action-copy span { font-size: 12px; color: var(--text-muted); }
.action-btns { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.status-panel { margin: 0 0 14px; padding: 12px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; }
.status-panel-title { font-weight: 700; margin-bottom: 4px; }
.status-panel.error {
  color: #ffb0b8; background: rgba(255, 93, 108, 0.1); border: 1px solid rgba(255, 93, 108, 0.28);
}
.status-panel.ok {
  color: #b8fff0; background: rgba(34, 195, 166, 0.1); border: 1px solid rgba(34, 195, 166, 0.24);
}
.status-panel details { margin-top: 8px; }
.status-panel summary { cursor: pointer; color: #ffd0d5; }
.status-panel pre { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 11px; opacity: 0.9; }
.soft-note { padding: 8px 14px; }
.help-toggle {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  border: 0; background: transparent; color: #e8f0ff; font-size: 14px; font-weight: 600;
  padding: 10px 2px; cursor: pointer;
}
.help-toggle .chev { color: var(--text-muted); font-size: 12px; font-weight: 500; }
.help-body { padding: 0 2px 12px; }
.help-body ul { margin: 0 0 10px; padding-left: 18px; color: var(--text-secondary); font-size: 13px; line-height: 1.7; }
.tech-list { margin-top: 8px !important; opacity: 0.9; }
.spinner {
  width: 14px; height: 14px; border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite;
  display: inline-block; vertical-align: -2px; margin-right: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 50% { opacity: 0.55; } }
@media (max-width: 720px) {
  .settings-page { padding: 18px 12px 36px; }
  .preset-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .section-head.between { flex-direction: column; }
  .section-head.between .btn { width: 100%; }
  .model-toolbar { flex-direction: column; align-items: stretch; }
  .current-model { max-width: none; }
  .action-bar { flex-direction: column; align-items: stretch; bottom: 8px; }
  .action-btns { width: 100%; }
  .action-btns .btn { flex: 1; }
  .manual-row { flex-direction: column; align-items: stretch; }
}
</style>
