import './styles/tailwind.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useLearningStore } from './store/learning'
import { useSettingsStore } from './store/settings'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// 初始化学习 store
const learningStore = useLearningStore()
learningStore.init()

const settingsStore = useSettingsStore()
settingsStore.init()

app.mount('#app')
