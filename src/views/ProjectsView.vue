<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useLearningStore } from "@/store/learning";

const router = useRouter();
const store = useLearningStore();
const projects = computed(() => store.projects);

function goToProject(id: string) {
  store.setActiveProject(id);
  router.push("/learn/" + id);
}

function deleteProject(id: string) {  if (confirm("确定要删除这个项目吗？")) {
    store.deleteProject(id);
  }
}
</script>

<template>
  <div class="projects-page">
    <header class="page-header">
      <h1>📚 我的学习项目</h1>
      <button class="new-project-btn" @click="router.push('/')">+ 新建项目</button>
    </header>
    <div class="projects-grid">
      <div v-if="projects.length === 0" class="empty-state">
        <p>😶 还没有学习项目</p>
        <button class="new-project-btn" @click="router.push('/')">开始学习</button>
      </div>
      <div v-for="proj in projects" :key="proj.id" class="project-card" @click="goToProject(proj.id)">
        <div class="project-icon">📖</div>
        <div class="project-info">
          <h3>{{ proj.name }}</h3>
          <p class="project-path">{{ proj.path.title }}</p>
          <div class="project-stats">
            <span class="stat">{{ proj.path.modules.length }} 个模块</span>
            <span class="stat">{{ proj.path.totalEstimatedHours }}h 总计</span>
          </div>
        </div>
        <button class="delete-btn" @click="deleteProject(proj.id)">🗑️</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.projects-page {
  @apply min-h-screen bg-[#0a0a1a] py-10 px-5;
}
.page-header {
  @apply max-w-[900px] mx-auto mb-8 flex justify-between items-center;
}
.page-header h1 {
  @apply text-[28px] font-bold text-white m-0;
}
.new-project-btn {
  @apply px-5 py-2.5 border border-[#6c63ff] rounded-xl bg-[rgba(108,99,255,0.1)] text-[#6c63ff] text-sm cursor-pointer transition-all duration-200 hover:bg-[rgba(108,99,255,0.2)];
}
.projects-grid {
  @apply max-w-[900px] mx-auto grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4;
}
.empty-state {
  @apply text-center py-20 px-5 col-span-full;
}
.empty-state p {
  @apply text-[#666] mb-5 text-base;
}
.project-card {
  @apply flex items-center gap-4 p-5 border border-white/[0.06] rounded-xl bg-white/[0.02] cursor-pointer transition-all duration-200 hover:border-[rgba(108,99,255,0.3)] hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)];
}
.project-icon {
  @apply text-[36px];
}
.project-info {
  @apply flex-1 min-w-0;
}
.project-info h3 {
  @apply text-base font-semibold text-white m-0 mb-1;
}
.project-path {
  @apply text-sm text-[#6c63ff] m-0 mb-2;
}
.project-stats {
  @apply flex gap-3;
}
.stat {
  @apply text-xs text-[#888];
}
.delete-btn {
  @apply px-2.5 py-1.5 border-0 rounded-md bg-transparent text-[#666] text-base cursor-pointer opacity-0 transition-opacity duration-200 hover:text-[#ff4757] hover:bg-[rgba(255,71,87,0.1)];
}
.project-card:hover .delete-btn {
  @apply opacity-100;
}

/* Responsive */
@media (max-width: 1024px) {
  .projects-grid { @apply grid-cols-[repeat(auto-fill,minmax(260px,1fr))]; }
}
@media (max-width: 768px) {
  .page-header { @apply flex-col gap-3 items-start; }
  .projects-grid { @apply grid-cols-1; }
  .project-card { @apply flex-col items-stretch text-left; }
  .delete-btn { @apply self-end; }
}
@media (max-width: 480px) {
  .projects-page { @apply py-6 px-3; }
  .page-header h1 { @apply text-[22px]; }
  .project-card { @apply p-4; }
}
</style>










