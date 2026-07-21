import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/LearningHome.vue'),
    },
    {
      path: '/learn/:id',
      name: 'learn',
      component: () => import('@/views/KnowledgeTreeView.vue'),
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@/views/ProjectsView.vue'),
    },
    {
      path: '/companion',
      name: 'companion',
      component: () => import('@/views/CompanionView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
  ],
})

// Route guard: validate project exists before entering /learn/:id
// Note: store is initialized in main.ts before the app mounts; this guard
// also reads localStorage as a fallback so deep links work on hard refresh.
router.beforeEach((to) => {
  if (!to.path.startsWith('/learn/')) return true

  const id = String(to.params.id ?? '')
  if (!id) return { name: 'projects' }

  try {
    const saved = localStorage.getItem('aios_projects')
    if (!saved) return { name: 'projects' }
    const projects = JSON.parse(saved) as Array<{ id: string }>
    const exists = projects.some((p) => p.id === id)
    if (!exists) return { name: 'projects' }
    // Keep active project in sync with the URL
    localStorage.setItem('aios_active_project', id)
    return true
  } catch {
    return { name: 'projects' }
  }
})

export default router
