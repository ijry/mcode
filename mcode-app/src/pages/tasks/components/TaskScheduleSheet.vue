<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import { scheduleWorkTask } from "@/services/workTask"
import {
  defaultTimeForDay,
  formatScheduleFull,
  isScheduleInPast,
  parseLocalDateTime,
  schedulePresets,
  splitIsoToLocal,
  toDayValue,
} from "../taskSchedule"
import type { CodegGateway } from "@/services/gateway"
import type { WorkTask } from "@/types/workTask"

/**
 * 计划一个待办任务什么时候开始。
 *
 * 用**两个**控件而不是一个 datetime：一个日期选择器 + 一个时间选择器。两者都说用户
 * 自己的墙上时钟（「九点跑」就是这个意思），转成服务端存的 UTC 时刻发生在保存时
 * （见 `taskSchedule.ts`）。
 *
 * 除非任务已有计划，弹层**打开时是空的**。给一个没计划的任务预填时间会让每个待办
 * 看起来都定了时；空字段说的是实话，而选了日期会顺手把小时填上
 * （`defaultTimeForDay`），一个决定仍然是一个决定。
 *
 * 已经过去的时间**接受**而不是拒绝：引擎下一轮扫描就领取它。弹层把这件事说出来，
 * 免得读成一个静默失效的计划。
 */
const props = defineProps<{
  show: boolean
  task: WorkTask | null
  gateway: CodegGateway | null
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "scheduled"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const day = ref("")
const time = ref("")
const submitting = ref(false)
const errorMessage = ref("")
const showDayPicker = ref(false)
const showTimePicker = ref(false)
/**
 * 打开时冻结的「现在」。预设与「已过去」提示是弹层出现那一刻的快照 ——
 * 一个走着的 now 会让它们在指针下面移动。
 */
const openedAt = ref(Date.now())
/**
 * 两个 picker 的绑定值**类型不同**，这是 `up-datetime-picker` 的既有契约
 * （见 uview-plus `u-datetime-picker` 的 `correctValue`）：
 * - `mode="date"` 用**毫秒时间戳**（内部走 dayjs）；
 * - `mode="time"` 用 **`"HH:mm"` 字符串**，传数字会被判成「时间错误」。
 *
 * 混用会让时间列直接不显示，且不报错 —— 所以两个 ref 的类型必须分开。
 */
const dayPickerValue = ref(Date.now())
const timePickerValue = ref("09:00")

const picked = computed(() => parseLocalDateTime(day.value, time.value))
const isPast = computed(
  () => picked.value != null && isScheduleInPast(picked.value, openedAt.value)
)
const hasPlan = computed(() => Boolean(props.task?.scheduled_at))
const presets = computed(() => schedulePresets(new Date(openedAt.value)))
const previewText = computed(() => {
  if (!picked.value) return ""
  return isPast.value
    ? "该时间已过 —— 保存后会在下一轮扫描时立即开始。"
    : `${formatScheduleFull(picked.value.toISOString())} 运行`
})

watch(
  () => props.show,
  (visible) => {
    if (!visible) return
    const now = Date.now()
    openedAt.value = now
    submitting.value = false
    errorMessage.value = ""
    showDayPicker.value = false
    showTimePicker.value = false
    const parts = splitIsoToLocal(props.task?.scheduled_at)
    day.value = parts.day
    time.value = parts.time
    const seed = props.task?.scheduled_at
      ? new Date(props.task.scheduled_at).getTime()
      : now
    dayPickerValue.value = Number.isFinite(seed) ? seed : now
    // 时间 picker 吃的是 "HH:mm" 字符串；没有已有计划时给一个中性的 09:00，
    // 而不是"现在"—— 现在这个时刻会让滚轮停在一个用户没选过的分钟数上。
    timePickerValue.value = parts.time || "09:00"
  }
)

function closeSheet() {
  emit("update:show", false)
}

function onDayConfirm(event: any) {
  const value = Number(event?.value)
  if (Number.isFinite(value)) {
    const pickedDay = new Date(value)
    day.value = toDayValue(pickedDay)
    // 只在时间还空着时补 —— 用户亲手选过的小时永远不动。
    if (!time.value) {
      time.value = defaultTimeForDay(day.value, new Date(openedAt.value))
      timePickerValue.value = time.value
    }
  }
  showDayPicker.value = false
}

function onTimeConfirm(event: any) {
  // `mode="time"` 的 confirm 给的是 "HH:mm" 字符串，不是时间戳。
  const value = String(event?.value || "")
  if (/^\d{2}:\d{2}$/.test(value)) {
    time.value = value
    timePickerValue.value = value
  }
  showTimePicker.value = false
}

function applyPreset(preset: { day: string; time: string }) {
  day.value = preset.day
  time.value = preset.time
  const parsed = parseLocalDateTime(preset.day, preset.time)
  if (parsed) {
    dayPickerValue.value = parsed.getTime()
  }
  timePickerValue.value = preset.time
}

async function save(next: string | null) {
  if (!props.task || !props.gateway || submitting.value) return
  submitting.value = true
  errorMessage.value = ""
  try {
    await scheduleWorkTask(props.gateway, props.task.id, next)
    uni.showToast({
      title: next ? "已定时" : "已清除定时",
      icon: "success",
    })
    emit("update:show", false)
    emit("scheduled")
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
    submitting.value = false
  }
}

function submit() {
  if (!picked.value) return
  void save(picked.value.toISOString())
}
</script>

<template>
  <view class="task-schedule-host">
    <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
      <view class="task-sheet" :style="upThemeCardStyle">
        <view class="task-sheet__hd">
          <view class="task-schedule__title-block">
            <text class="task-sheet__title">定时运行任务</text>
            <text class="task-sheet__desc">
              任务留在「待办」，到点自动开始。文件夹的并发上限依然生效。
            </text>
          </view>
          <view class="task-sheet__close" @click="closeSheet">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

        <view class="task-schedule__row">
          <view class="task-schedule__field">
            <text class="task-form-label">日期</text>
            <view class="task-form-readonly" @click="showDayPicker = true">
              <text class="task-form-readonly__text">{{ day || "选择日期" }}</text>
              <up-icon name="calendar" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
            </view>
          </view>
          <view class="task-schedule__field task-schedule__field--time">
            <text class="task-form-label">时间</text>
            <view class="task-form-readonly" @click="showTimePicker = true">
              <text class="task-form-readonly__text">{{ time || "选择时间" }}</text>
              <up-icon name="clock" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
            </view>
          </view>
        </view>

        <view class="task-chip-row task-schedule__presets">
          <view
            v-for="preset in presets"
            :key="preset.label"
            :class="['task-chip', day === preset.day && time === preset.time && 'task-chip--active']"
            @click="applyPreset(preset)"
          >
            <text class="task-chip__text">{{ preset.label }}</text>
          </view>
        </view>

        <view v-if="previewText" :class="['task-notice', isPast && 'task-notice--warning']">
          <text class="task-notice__text">{{ previewText }}</text>
        </view>

        <view v-if="errorMessage" class="task-notice task-notice--error">
          <text class="task-notice__text">{{ errorMessage }}</text>
        </view>

        <view class="task-sheet__actions">
          <up-button
            v-if="hasPlan"
            shape="circle"
            :disabled="submitting"
            @click="save(null)"
          >清除定时</up-button>
          <up-button shape="circle" :disabled="submitting" @click="closeSheet">取消</up-button>
          <up-button
            type="primary"
            shape="circle"
            :loading="submitting"
            :disabled="picked == null"
            @click="submit"
          >保存</up-button>
        </view>

        <view class="task-safe-bottom"></view>
      </view>
    </up-popup>

    <up-datetime-picker
      :show="showDayPicker"
      v-model="dayPickerValue"
      mode="date"
      title="选择日期"
      @confirm="onDayConfirm"
      @cancel="showDayPicker = false"
      @close="showDayPicker = false"
    ></up-datetime-picker>

    <up-datetime-picker
      :show="showTimePicker"
      v-model="timePickerValue"
      mode="time"
      title="选择时间"
      @confirm="onTimeConfirm"
      @cancel="showTimePicker = false"
      @close="showTimePicker = false"
    ></up-datetime-picker>
  </view>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-schedule__title-block {
  flex: 1;
  min-width: 0;
}

.task-schedule__row {
  display: flex;
  align-items: flex-end;
  gap: 16rpx;
  margin-bottom: 22rpx;
}

.task-schedule__field {
  flex: 1;
  min-width: 0;
}

.task-schedule__field--time {
  flex: 0 0 240rpx;
}

.task-schedule__presets {
  margin-bottom: 22rpx;
}
</style>
