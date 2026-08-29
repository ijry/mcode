# 新建连接隐藏 OpenCode / MCode Desktop 目标类型

## 需求

新增连接表单的「目标类型」暂时只对外暴露 Codeg，OpenCode 与 MCode Desktop 先隐藏。

## 实现

新增 `mcode-app/src/pages/connections/connectionTargetAgentOptions.ts`，把选项表和下标
换算从 `pages/connections/index.vue` 里抽出来：

```ts
export const TARGET_AGENT_OPTIONS: TargetAgentOption[] = [
  { label: "Codeg", value: "codeg" },
  { label: "OpenCode", value: "opencode", hidden: true },
  { label: "MCode Desktop", value: "mcode-desktop", hidden: true },
]
```

**为什么不直接删掉两项。** `editConnection()` 会把存量记录的 `targetAgent` 灌进表单，
`u-subsection` 只认下标。若选项表里查不到 `mcode-desktop`，`findIndex` 返回 -1，代码
回落成 0，界面显示「Codeg」，用户一点保存就把一条 mcode-desktop 连接**静默改写**成
codeg，连接随后必然失效且没有任何提示。所以保留全量选项，只打 `hidden` 标记。

导出的四个纯函数：

- `getVisibleTargetAgentOptions(selected)`：未隐藏项加上当前选中的隐藏项，顺序沿用
  `TARGET_AGENT_OPTIONS` 原序（避免选中项跳到列表尾部）。
- `getTargetAgentIndex(selected)`：选中值在可见列表里的下标，查不到返回 0。
- `resolveTargetAgentByIndex(index, selected)`：下标反查值，越界回落 `"codeg"`。
- `getPairCodeTip(selected)`：可见项只剩一个时不再罗列另外两个名字。

## UI 行为

`mcode-app/src/pages/connections/index.vue` 把原来的常量 `targetAgentOptions` 与
`targetAgentLabels` 换成 computed：

- `targetAgentLabels` 取可见项标签；
- `showTargetAgentPicker` 为 `targetAgentLabels.length > 1`，控制「目标类型」
  `u-form-item` 的 `v-if`；
- `pairCodeTip` 替换原先硬编码的「Codeg、OpenCode 与 MCode Desktop 可以分别通过同一
  网关连接」。

结果：

1. 新增连接（`targetAgent` 默认 `codeg`）时可见项只有 Codeg，整个「目标类型」分段器
   隐藏，提示语变成「请使用 Codeg 生成的配对代码。」。
2. 编辑一条存量 `mcode-desktop` 连接时可见项为 Codeg 与 MCode Desktop，分段器重新出现，
   当前选中项正确高亮，提示语列出这两项。用户可以主动改成 Codeg，但不会被静默改写。
3. `opencode` 同理。

## 兼容性

- 连接记录 schema 与 `ConnectionTargetAgent` 联合类型均未改动，无迁移。
- driver registry、relay 与桌面端未改动；隐藏纯粹是表单层的可见性收敛，已保存的
  opencode / mcode-desktop 连接照常连接与运行。
- 恢复暴露的方式就是去掉对应项的 `hidden: true`，无其他改动点。

## 原生端（iOS / Android）复刻要点

1. 目标类型的枚举表保持完整，隐藏用一个 `hidden` 标记表达，不要从数据源里移除条目。
2. 可见列表等于「未隐藏项」并入「当前值」。渲染选择器前先算这个集合，再用它做下标换算，
   保证界面显示的值与即将提交的值始终一致。
3. 下标反查越界时回落到默认目标（`codeg`），不要抛异常或写入空值。
4. 可见项只有一个时隐藏整个选择器控件，并让配对提示语只提这一个目标名。
5. 不要在编辑流程里用「显示值」覆盖「存储值」，未被用户主动修改的字段应原样回写。

## 验证

- `mcode-app`: `npx jest --config jest.config.cjs --runInBand` → 148 suites / 1132 tests 全绿
  （新增 `tests/pages/connections/connectionTargetAgentOptions.spec.ts` 6 例）。
- `npx vue-tsc --noEmit -p tsconfig.json`：`pages/connections/index.vue` 仅剩 `conn.id`
  可选性导致的 3 条**存量**报错，本次改动未引入新报错。
- `npx uni build` 通过。

## 相关笔记

- `2026-08-29-14-57-connection-pair-double-confirm.md`（同一轮改动的另一项：配对需二次
  确认的成因与修复）
