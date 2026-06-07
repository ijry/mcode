# UTS TTS 插件示例

本目录包含UTS TTS插件的使用示例。

## 示例列表

### 1. 基础示例 (basic.vue)
演示最基本的TTS功能：
- 简单文本朗读
- 带回调的朗读
- 停止朗读

### 2. 完整示例 (complete.vue)
演示所有TTS功能：
- 文本输入
- 语速、音调、音量调节
- 播放控制（播放、暂停、继续、停止）
- 朗读状态显示
- 进度显示
- 语音列表和切换

### 3. 多语言示例 (multilang.vue)
演示多语言支持：
- 中文朗读
- 英文朗读
- 其他语言朗读
- 语言自动切换

### 4. 连续朗读示例 (continuous.vue)
演示连续朗读多段文本：
- 文本列表管理
- 顺序朗读
- 跳过当前
- 循环播放

## 使用方法

1. 将示例文件复制到你的uni-app项目的pages目录
2. 在pages.json中注册页面
3. 运行项目查看效果

```json
{
  "pages": [
    {
      "path": "pages/tts-basic",
      "style": {
        "navigationBarTitleText": "TTS基础示例"
      }
    },
    {
      "path": "pages/tts-complete",
      "style": {
        "navigationBarTitleText": "TTS完整示例"
      }
    }
  ]
}
```
