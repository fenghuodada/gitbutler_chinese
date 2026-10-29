# GitButler 简体中文版

本仓库基于 **GitButler 0.23.1** 官方源码（`main` / tag `baseline-0.23.1`），
在 `zh-cn` 分支上重新植入简体中文层。

## 来源

0.22.3 的原始源码工作区已被删除。i18n 运行时、中文词典和语言设置卡片是从
0.22.3 的 Tauri 构建缓存（source map）中恢复的：

- `packages/core/src/gb-i18n.ts`
- `packages/core/src/gb-i18n-zh-CN.ts`
- `apps/desktop/src/components/settings/language/GbLanguageSettingsCard.svelte`
- `scripts/i18n/preprocessor.mjs`
- `scripts/i18n/zh-CN.js`（预处理器读取的纯 JS 词典副本）

## 实现方式

1. 运行时按**英文原文**查词典：`__gb_t("English text")`，查不到自动回退英文。
2. Svelte 预处理器在构建时把 markup 文本/表达式包成 `__gb_t(...)`；
   混合文本和表达式只有命中词典时才改写（避免翻译 commit message 等用户内容）。
   字面量 `alt`、`aria-label`、`label`、`placeholder`、`title` 属性同样在命中
   词典时改写为表达式（示例值、令牌占位符等不在词典中，保持原样）。
3. 设置 → General → Language 可以选择 `System default` / `English` / `简体中文`。
4. 安装包使用 `zh-CN` WiX 语言、产品名 `GitButler 中文版`、identifier
   `com.gitbutler.app.zhcn`。

## 构建

```bash
pnpm install
# Windows 上必须显式设置 OS=windows：before-build 脚本只在 $OS=windows 时
# 构建 `but`，否则 tauri 会因为缺少 external binary 而打包失败。
OS=windows pnpm exec tauri build --features windows \
  --config crates/gitbutler-tauri/tauri.conf.zh-CN.json
```

产物：`target/release/bundle/msi/GitButler 中文版_<version>_x64_zh-CN.msi`。

> 本 fork 在 `crates/gitbutler-tauri/build.rs` 里为**所有** Windows 构建添加了
> `/STACK:8388608`（上游只在 `builtin-gpui` 时添加）。Windows 主线程默认只有
> 1 MB 栈，Tauri 在主线程 WebView 消息循环里 `tokio::spawn` 命令，push 这类
> future 很大（~212 KB），没有 8 MB 栈时会在点 Push 时栈溢出、进程无提示退出。
> 合并上游时不要丢掉这段，否则“点 push 闪退”会复发。

`tauri-before-build-command.sh production` 会先构建前端、`but` 和
`gitbutler-git-askpass`，然后注入 external binaries。`turbo.json` 的
`globalDependencies` 包含 `scripts/i18n/**`，修改词典会正确触发前端重建。

## 维护词典

两份词典内容必须一致：

- `packages/core/src/gb-i18n-zh-CN.ts`（运行时，首次运行时加载）
- `scripts/i18n/zh-CN.js`（预处理器在构建时读取；是上面文件去掉首行
  `// @ts-nocheck` 的副本）

新增文案后检查覆盖率：

```bash
node scripts/i18n/scan.mjs          # 列出仍未翻译的 Svelte 标记文本
node scripts/i18n/scan.mjs --json   # 机器可读输出
```

扫描器与预处理器共用 `collectMarkupMessages()`，因此报告中的 “missing”
就是应用实际会显示英文的内容。品牌名、标识符和纯标点无需翻译。

## 已知限制

- Svelte 标记文本和常用展示属性已覆盖；`.ts`/`.tsx` 文件里的 UI 文案
  （如部分 toast、错误提示）尚未接入翻译。
- `tauri.conf.zh-CN.json` 把 updater 指向一个不可用地址，防止官方更新再次覆盖
  中文版。以后要自动更新，需要自己维护中文更新源。
- 安装包仍是本地未签名构建；正式分发前需要按团队流程签名。
