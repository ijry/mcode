# UP Scanner

跨平台二维码/条形码扫描插件，基于 UTS 开发，支持 iOS、Android 和 HarmonyOS Next。

## 功能特性

- ✅ 支持 iOS、Android、HarmonyOS Next 三大平台
- ✅ 支持二维码（QR Code）、条形码（Barcode）、Data Matrix、PDF417 等多种码制
- ✅ 自动请求相机权限
- ✅ 支持闪光灯控制
- ✅ 实时扫码识别
- ✅ 完整的错误处理
- ✅ TypeScript 类型支持

## 平台支持

| 平台 | 支持情况 | 技术方案 |
|------|---------|---------|
| Android | ✅ | CameraX + ML Kit Barcode Scanning |
| iOS | ✅ | AVFoundation |
| HarmonyOS Next | ✅ | Camera + ScanBarcode |
| Web | ❌ | 不支持 |
| 小程序 | ❌ | 不支持 |

## 安装

将插件复制到项目的 `uni_modules` 目录下即可。

```
your-project/
├── uni_modules/
│   └── up-scanner/
└── ...
```

## 使用方法

### 基础用法

```vue
<template>
  <view class="container">
    <button @click="startScan">扫描二维码</button>
    <view v-if="result">
      <text>扫描结果：{{ result.content }}</text>
      <text>码制类型：{{ result.scanType }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { scanCode } from '@/uni_modules/uts-qrcode-scanner';

const result = ref<any>(null);

const startScan = () => {
  scanCode({
    success: (res) => {
      console.log('扫码成功', res);
      result.value = res;
      uni.showToast({
        title: '扫码成功',
        icon: 'success'
      });
    },
    fail: (err) => {
      console.error('扫码失败', err);
      uni.showToast({
        title: err.errMsg,
        icon: 'none'
      });
    }
  });
};
</script>
```

### 高级用法

```typescript
import { scanCode } from '@/uni_modules/up-scanner';

// 指定扫码类型
scanCode({
  scanType: ['qrCode', 'barCode'], // 只识别二维码和条形码
  autoZoom: true, // 自动缩放（Android）
  success: (res) => {
    console.log('扫描内容:', res.content);
    console.log('码制类型:', res.scanType);
    console.log('字符集:', res.charSet);
  },
  fail: (err) => {
    console.error('错误码:', err.errCode);
    console.error('错误信息:', err.errMsg);
  },
  complete: () => {
    console.log('扫码完成');
  }
});
```

## API 文档

### scanCode(options: ScanOptions)

调起扫码界面进行扫码。

#### ScanOptions

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| scanType | Array\<string\> | 否 | ['qrCode', 'barCode'] | 扫码类型，可选值：'qrCode'、'barCode'、'datamatrix'、'pdf417' |
| autoZoom | boolean | 否 | false | 是否自动缩放（仅 Android） |
| onlyFromCamera | boolean | 否 | false | 是否只从相机扫描（保留字段，暂未实现） |
| success | Function | 否 | - | 成功回调 |
| fail | Function | 否 | - | 失败回调 |
| complete | Function | 否 | - | 完成回调 |

#### ScanResult (success 回调参数)

| 参数 | 类型 | 说明 |
|------|------|------|
| content | string | 扫描到的内容 |
| scanType | string | 码制类型，如 'QR_CODE'、'EAN_13' 等 |
| charSet | string | 字符集（可选） |

#### ScanFailResult (fail 回调参数)

| 参数 | 类型 | 说明 |
|------|------|------|
| errCode | number | 错误码 |
| errMsg | string | 错误信息 |
| errSubject | string | 错误主题 |

#### 错误码说明

| 错误码 | 说明 |
|--------|------|
| 10001 | 用户取消扫码 |
| 10002 | 相机权限被拒绝 |
| 10003 | 相机初始化失败 |
| 10004 | 扫码失败 |
| 10005 | 不支持的平台 |

## 支持的码制类型

### 二维码 (qrCode)
- QR Code

### 条形码 (barCode)
- EAN-13
- EAN-8
- UPC-A
- UPC-E
- Code 39
- Code 93
- Code 128

### 其他
- Data Matrix (datamatrix)
- PDF417 (pdf417)

## 权限配置

### Android

插件已自动配置相机权限，无需手动添加。如需自定义，可在 `manifest.json` 中配置：

```json
{
  "app-plus": {
    "distribute": {
      "android": {
        "permissions": [
          "<uses-permission android:name=\"android.permission.CAMERA\"/>",
          "<uses-feature android:name=\"android.hardware.camera\"/>",
          "<uses-feature android:name=\"android.hardware.camera.autofocus\"/>"
        ]
      }
    }
  }
}
```

### iOS

插件已自动配置相机权限描述，无需手动添加。如需自定义描述文字，可在 `manifest.json` 中配置：

```json
{
  "app-plus": {
    "distribute": {
      "ios": {
        "privacyDescription": {
          "NSCameraUsageDescription": "需要使用相机扫描二维码"
        }
      }
    }
  }
}
```

### HarmonyOS Next

插件会自动请求相机权限，需要在 `module.json5` 中声明：

```json
{
  "requestPermissions": [
    {
      "name": "ohos.permission.CAMERA",
      "reason": "$string:camera_reason",
      "usedScene": {
        "abilities": ["EntryAbility"],
        "when": "inuse"
      }
    }
  ]
}
```

## 技术实现

### Android
- **相机框架**: CameraX
- **扫码引擎**: Google ML Kit Barcode Scanning
- **最低版本**: Android 5.0 (API 21)

### iOS
- **相机框架**: AVFoundation
- **扫码引擎**: AVCaptureMetadataOutput
- **最低版本**: iOS 12.0

### HarmonyOS Next
- **相机框架**: @ohos.multimedia.camera
- **扫码引擎**: @ohos.scanBarcode
- **最低版本**: API 11

## 注意事项

1. **权限处理**: 首次使用会自动请求相机权限，用户拒绝后需引导用户到设置中手动开启
2. **相机占用**: 扫码过程中会占用相机，其他应用无法同时使用
3. **性能优化**: 扫码识别在独立线程中进行，不会阻塞 UI
4. **错误处理**: 建议在 fail 回调中处理各种错误情况，提供友好的用户提示
5. **平台差异**: 不同平台的扫码界面和交互可能略有差异

## 常见问题

### 1. 扫码界面无法打开？
- 检查是否已授予相机权限
- 检查设备是否有可用的摄像头
- 查看控制台错误日志

### 2. 扫码识别率低？
- 确保光线充足
- 保持二维码清晰完整
- 调整扫码距离
- 尝试开启闪光灯

### 3. Android 编译失败？
- 确保 minSdkVersion >= 21
- 检查网络连接，确保能下载 Maven 依赖
- 清理项目后重新编译

### 4. iOS 编译失败？
- 确保 Deployment Target >= 12.0
- 检查 Info.plist 中是否有相机权限描述
- 清理 Xcode 缓存后重新编译

## 示例项目

本仓库包含完整的示例项目，可直接运行查看效果：

```bash
# 运行到 Android
npm run dev:app-android

# 运行到 iOS
npm run dev:app-ios

# 运行到 HarmonyOS
npm run dev:app-harmony
```

## 更新日志

### v1.0.0 (2026-05-31)
- 🎉 首次发布
- ✅ 支持 Android、iOS、HarmonyOS Next
- ✅ 支持多种码制识别
- ✅ 完整的权限处理
- ✅ 闪光灯控制

## 开源协议

MIT License

## 技术支持

如有问题或建议，欢迎提交 Issue。

## 相关链接

- [uni-app 官网](https://uniapp.dcloud.net.cn/)
- [UTS 插件开发文档](https://uniapp.dcloud.net.cn/plugin/uts-plugin.html)
- [Google ML Kit](https://developers.google.com/ml-kit/vision/barcode-scanning)
- [AVFoundation](https://developer.apple.com/av-foundation/)
- [HarmonyOS Camera](https://developer.harmonyos.com/cn/docs/documentation/doc-references-V3/js-apis-camera-0000001478341393-V3)
