import { createRouter, createWebHistory } from 'vue-router'
import LearningHome from '@/views/LearningHome.vue'
import KnowledgeTreeView from '@/views/KnowledgeTreeView.vue'
import ProjectsView from '@/views/ProjectsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: LearningHome },
    { path: '/learn/:id', name: 'learn', component: KnowledgeTreeView },
    { path: '/projects', name: 'projects', component: ProjectsView },
  ],
})

// Route guard: validate project exists before entering /learn/:id
router.beforeEach((to) => {
  if (to.path.startsWith('/learn/')) {
    const saved = localStorage.getItem('aios_projects')
    if (saved) {
      try {
        const projects = JSON.parse(saved)
        const exists = projects.some((p: any) => p.id === to.params.id)
        if (!exists) {
          return { name: 'projects' }
        }
      } catch {
        return { name: 'projects' }
      }
    } else {
      return { name: 'projects' }
    }
  }
})

export default router
