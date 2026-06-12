# 会话列表首屏秒开

## 范围

本次只调整 `mcode-app` 会话列表页首屏总览加载顺序，不改详情页协议、
SQLite 表结构或远端接口。

## 数据流

列表页打开后，每个已连接实例按下面顺序加载：

1. 读取远端 `list_open_folder_details` 与 `list_opened_tabs`。
2. 立即读取本地 SQLite conversation summaries 并组装连接分组。
3. `conversation://changed` 的全局 realtime bridge 改为后台建立，不再阻塞首屏。
4. 如果本地 summary 为空，后台再调用 `list_all_conversations` 回填 SQLite，并在完成后替换当前分组。
5. 如果本地 summary 已存在，也继续沿用已有后台 refresh 校准远端真值。

这样首屏只依赖“轻量远端元数据 + 本地缓存”，重同步路径全部后移。

## UI 行为

- 首次进入列表页时，项目分组和打开中的 tab 会更早显示。
- 最近活跃会话允许晚一点补齐；本地无缓存时会先看到空的 recent active 区域，
  随后由后台回填。
- 返回列表页、下拉刷新、dirty 标记与本地 invalidation 行为保持不变。

## 兼容性

- 不新增接口，不修改已有 payload。
- SQLite 仍然是列表页本地真值缓存；远端全量会话只负责后台校准。
- realtime bridge 仍然会建立，只是从“首屏前置依赖”改成“后台副作用”。

## iOS / Android 复刻指引

- 原生端列表首屏同样不要等待 realtime 订阅 ready。
- 首屏只等待 folder/tab 元数据和本地会话 summary。
- 本地 summary 为空时，允许先渲染轻列表，再异步回填远端全量会话。
- realtime 订阅失败不能阻塞列表页，只记录日志并保留后续重试机会。
