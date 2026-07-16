<script setup lang="ts">
</script>

<template>
  <RouterView />
</template>

<style>

/* Custom base overrides */
html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background: #0a0a1a;
  color: #e0e0e0;
}
#app { height: 100%; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #3a3a5a; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #5a5a7a; }
</style>

