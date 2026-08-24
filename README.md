# DSH 个人知识库 Preset

让 DSH 会话在学习问答时自动**提炼**知识点，按主题分类存入个人知识库，通过坚果云 WebDAV 跨设备同步。

本仓库就是一个 agent preset 目录（`agent.cordis.yml` + `save-knowledge.js` + `preset.yml`），克隆到 `~/.dsh/.agent-presets/knowledge/` 即可被 DSH 发现加载。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `agent.cordis.yml` | 组合：standard 完整编码代理 + `save-knowledge` 工具行（相对路径引用本目录插件） |
| `save-knowledge.js` | 工具实现：提炼式知识卡片 + 主题分类 + WebDAV 写入（纯 JS，零依赖） |
| `preset.yml` | 显示元数据（名称/描述） |
| `README.md` | 本说明 |

## 功能

- 学习问答 → 自动提炼为结构化知识卡片（🎯 一句话总结 / 📌 核心知识点 / 💡 例子 / ⚠️ 易错点 / 🔗 相关概念），不直接记录对话
- 按主题自动分类为子目录（`topic` 可含路径，如 `编程/JavaScript` 生成多级目录）
- 每主题一个 `README.md` 索引，根 `README.md` 为主题地图，增量维护
- 优先写入坚果云 WebDAV（云端 `知识库/` 目录，跨设备同步）；未配置凭据时自动回退本地工作区

## 在设备上安装

1. 安装 DSH（标准部署自带 preset 依赖的 `@deepseek-ai/dsh-*` 标准包）
2. 克隆本仓库到 preset 目录（PowerShell）：

   ```powershell
   git clone https://github.com/paranoiadd/dsh_knowledge_preser.git "$env:USERPROFILE\.dsh\.agent-presets\knowledge"
   ```

   > 也可以把本目录复制到 `~/.dsh/.agent-presets/knowledge`。

3. 配置坚果云凭据：在 `$env:USERPROFILE\.dsh\.credentials.yaml` 添加一行

   ```yaml
   JIANGUOYUN_WEBDAV: "你的坚果云邮箱:应用密码"
   ```

   应用密码获取：坚果云 → 右上角账户信息 → 安全选项 → 添加应用密码（如 `dsh`）。
   **应用密码是账号级的，同一份可以在你的所有设备复用。**

4. 在 Web 界面新开会话，选择 preset「个人知识库」，开始学习即可。

## 更新

```powershell
git -C "$env:USERPROFILE\.dsh\.agent-presets\knowledge" pull
```

已运行的 DSH 进程需要重启后，新会话才加载新版本（standing mount 是进程级缓存的）。

## 注意

- 凭据（应用密码）**绝不入库**：只在各设备本地的 `.credentials.yaml` 中配置
- 应用密码若泄露，去坚果云删除并重新生成，再更新各设备凭据
- 知识数据本身通过坚果云同步；本仓库只同步 preset 代码（两通道，各司其职）
