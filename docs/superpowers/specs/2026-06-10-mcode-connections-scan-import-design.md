# 连接扫码导入设计

## 目标

让 `mcode-app` 的“新增连接 > 扫码连接”直接兼容当前已有的连接配置码格式，并复用 `up-scanner` 完成 App 端扫码导入。

## 方案

### 配置码格式

继续复用 [mcode-app/src/pages/connections/connectionConfigCode.ts](/D:/Repos/xyito/lingyun/mcode/mcode-app/src/pages/connections/connectionConfigCode.ts) 中现有的 `version: 1` base64url 配置码格式，不新增新版本或新字段。

### 扫码导入流程

在 [mcode-app/src/pages/connections/index.vue](/D:/Repos/xyito/lingyun/mcode/mcode-app/src/pages/connections/index.vue) 的“扫码连接”分段内提供按钮触发 `up-scanner` 的 `scanCode()`。

扫码成功后：

1. 读取扫码内容。
2. 用配置码解码逻辑解析。
3. 校验是否为受支持的连接配置。
4. 转换成页面现有 `ConnectionItem` 结构。
5. 复用现有 `saveConnection()` 持久化。
6. 刷新连接列表并提示导入成功。

### 平台和错误处理

- H5 / 非 App 平台不调起扫码，直接提示当前平台暂不支持。
- 用户取消扫码不报导入失败 toast。
- 非法配置码、字段缺失、版本不支持时给出明确错误提示。

## 测试

在 [mcode-app/tests/pages/connections/connectionConfigCode.spec.ts](/D:/Repos/xyito/lingyun/mcode/mcode-app/tests/pages/connections/connectionConfigCode.spec.ts) 为配置码导入补充测试：

- 直连配置码可解码并转换为连接对象。
- 中继配置码可解码并转换为连接对象。
- 非法格式或缺字段时报错。
