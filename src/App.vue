<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ToastHost from '@/components/ToastHost.vue'

const route = useRoute()
const router = useRouter()

const links = [
  { name: 'home', label: '首页', path: '/' },
  { name: 'projects', label: '项目', path: '/projects' },
  { name: 'companion', label: '陪伴', path: '/companion' },
  { name: 'settings', label: '设置', path: '/settings' },
]

const activeName = computed(() => {
  if (route.name === 'learn') return 'projects'
  return String(route.name || 'home')
})

function go(path: string) {
  if (route.path !== path) router.push(path)
}
</script>

<template>
  <div class="app-shell">
    <header class="app-nav">
      <a class="brand" href="/" @click.prevent="go('/')">
        <span class="brand-mark">🎓</span>
        <span>
          <div class="brand-text">AI Learning OS</div>
          <div class="brand-sub">本地学习工作台</div>
        </span>
      </a>

      <nav class="nav-links" aria-label="主导航">
        <button
          v-for="link in links"
          :key="link.name"
          type="button"
          class="nav-link"
          :class="{ active: activeName === link.name }"
          @click="go(link.path)"
        >
          {{ link.label }}
        </button>
      </nav>
    </header>

    <main class="page">
      <RouterView />
    </main>

    <ToastHost />
  </div>
</template>
