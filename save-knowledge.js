// save-knowledge.js — preset 本地插件：学习问答自动沉淀到个人知识库
// 存储：优先坚果云 WebDAV（跨设备同步）；凭据未配置时回退本地工作区写入。
// 分类：按主题自动归类为子目录（topic 可含路径，如 "编程/JavaScript"），
//       每主题一个 README 索引，根 README 为主题地图。
// 记录方式：提炼式知识卡片（一句话总结 + 核心知识点 + 例子 + 易错点 + 相关概念）。
// 纯 JavaScript，无 import；使用宿主全局 fetch / btoa / encodeURIComponent。
export default {
  name: 'save-knowledge',
  inject: ['tools'],
  apply(ctx) {
    const WEBDAV_BASE = 'https://dav.jianguoyun.com/dav'
    const KB_DIR = '知识库'
    const CRED_REF = 'JIANGUOYUN_WEBDAV'

    function pad(n) { return String(n).padStart(2, '0') }
    function slugify(s) {
      const t = String(s || '')
        .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
      return t.slice(0, 24)
    }
    function topicSegments(topic) {
      const segs = String(topic || '').split(/[\\/]/).map((s) => slugify(s)).filter((s) => s.length > 0)
      return segs.length > 0 ? segs : ['未分类']
    }
    function listLines(items) {
      const arr = Array.isArray(items) ? items : []
      return arr.map((p) => String(p).trim()).filter((p) => p.length > 0)
    }
    function entryMarkdown(args, now) {
      const date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
      const tags = args.tags && args.tags.trim()
        ? args.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean).map((t) => '`' + t + '`').join(' ')
        : ''
      const lines = [
        '# ' + args.question,
        '',
        '> **主题**：' + args.topic + '　**日期**：' + date + (tags ? '　**标签**：' + tags : ''),
        '',
        '## 🎯 一句话总结',
        '',
        String(args.summary || '').trim(),
        ''
      ]
      const keys = listLines(args.keyPoints)
      if (keys.length > 0) {
        lines.push('## 📌 核心知识点', '')
        for (const k of keys) lines.push('- ' + k)
        lines.push('')
      }
      if (args.example && String(args.example).trim().length > 0) {
        lines.push('## 💡 例子', '', String(args.example).trim(), '')
      }
      const pits = listLines(args.pitfalls)
      if (pits.length > 0) {
        lines.push('## ⚠️ 易错点', '')
        for (const p of pits) lines.push('- ' + p)
        lines.push('')
      }
      const rels = listLines(args.related)
      if (rels.length > 0) {
        lines.push('## 🔗 相关概念', '')
        for (const r of rels) lines.push('- ' + r)
        lines.push('')
      }
      lines.push('---', '*由 DSH 学习助手自动收录*', '')
      return lines.join('\n')
    }
    function indexLine(args, now) {
      const date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
      const q = String(args.question).replace(/\s+/g, ' ').slice(0, 60)
      return '- ' + date + ' | ' + (args.topic || '未分类') + ' | ' + q
    }
    function entryFilename(args, now) {
      const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
      const q = slugify(args.question)
      return stamp + '-' + (q || '未分类') + '.md'
    }
    function cwdOf(agent) {
      try {
        const cwd = agent && agent.session && agent.session.header ? agent.session.header.cwd : void 0
        return typeof cwd === 'string' && cwd.length > 0 ? cwd : ''
      } catch (err) { return '' }
    }
    function enc(seg) { return encodeURIComponent(seg) }

    // 统一保存流程：store 提供 get(rel)/put(rel, content)（rel 相对知识库根）
    async function saveEntry(store, ensureDirs, topicPath, topicDisplay, filename, markdown, line) {
      await ensureDirs(topicPath)
      await store.put(topicPath + '/' + filename, markdown)
      const topicIdxRel = topicPath + '/README.md'
      const existingIdx = await store.get(topicIdxRel)
      const idxContent = existingIdx === null
        ? '# 索引：' + topicPath + '\n\n' + line + '\n'
        : existingIdx.replace(/\n\s*$/, '') + '\n' + line + '\n'
      await store.put(topicIdxRel, idxContent)
      const rootRel = 'README.md'
      const existingRoot = await store.get(rootRel)
      const topicLine = '- **' + topicDisplay + '**'
      if (existingRoot === null) {
        await store.put(rootRel, '# 个人知识库 · 索引\n\n' + topicLine + '\n')
      } else if (!existingRoot.includes(topicLine)) {
        await store.put(rootRel, existingRoot.replace(/\n\s*$/, '') + '\n' + topicLine + '\n')
      }
    }

    // ── WebDAV 原语 ────────────────────────────────────────────────────────
    async function resolveAuth() {
      const creds = ctx.get('credentials')
      if (creds === undefined) return null
      const resolved = await creds.resolve(CRED_REF)
      if (!resolved || typeof resolved.value !== 'string' || resolved.value.length === 0) return null
      return { value: resolved.value, header: 'Basic ' + btoa(resolved.value) }
    }
    async function davEnsureDir(url, auth, signal) {
      const res = await fetch(url, { method: 'MKCOL', headers: { Authorization: auth }, signal })
      if (res.status === 201 || res.status === 405 || res.status === 301) return
      if (res.status >= 400) throw new Error('WebDAV 创建目录失败 HTTP ' + res.status)
    }
    async function davPut(url, content, auth, signal) {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: auth, 'Content-Type': 'text/plain; charset=utf-8' },
        body: content,
        signal
      })
      if (res.status >= 400) throw new Error('WebDAV 上传失败 HTTP ' + res.status)
    }
    async function davGet(url, auth, signal) {
      const res = await fetch(url, { method: 'GET', headers: { Authorization: auth }, signal })
      if (res.status === 404) return null
      if (res.status >= 400) throw new Error('WebDAV 读取失败 HTTP ' + res.status)
      return await res.text()
    }

    return ctx.tools.register({
      name: 'save_knowledge',
      description: '将用户的学习问答**提炼**为结构化知识卡片，**按主题自动分类**保存到个人知识库（知识库/<主题>/ 目录；topic 可含路径如 “编程/JavaScript” 生成多级子目录；每主题一个 README 索引，根 README 为主题地图；优先写入坚果云 WebDAV 跨设备同步，未配置凭据时回退本地工作区）。**不要直接记录对话内容**——调用时把解答提炼成：一句话总结（summary）+ 核心知识点列表（keyPoints，每条一个独立知识点）+ 可选的例子（example）/ 易错点（pitfalls）/ 相关概念（related），精炼、可直接复习。当用户提出学习性问题并已得到解答时调用；每次学习问答调用一次。',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '知识所属主题/分类（按内容自动归类），例如 “JavaScript” 或 “编程/JavaScript”（可含 / 生成多级子目录）；没有明确主题时用 “杂项”' },
          question: { type: 'string', description: '用户提出的学习问题原文' },
          summary: { type: 'string', description: '一句话总结（20-50 字，能回答“这个知识点是什么”）' },
          keyPoints: { type: 'array', items: { type: 'string' }, description: '核心知识点列表，每条一个独立知识点（2-6 条，精炼完整，可直接用于复习）' },
          example: { type: 'string', description: '一个具体例子帮助理解（可选）' },
          pitfalls: { type: 'array', items: { type: 'string' }, description: '易错点或注意事项列表（可选）' },
          related: { type: 'array', items: { type: 'string' }, description: '相关概念或延伸主题列表（可选）' },
          tags: { type: 'string', description: '可选，逗号分隔的标签，如 “前端,面试”' }
        },
        required: ['topic', 'question', 'summary', 'keyPoints']
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            saved: { type: 'boolean' },
            file: { type: 'string' },
            topic: { type: 'string' },
            root: { type: 'string' },
            mode: { type: 'string' }
          },
          required: ['saved']
        },
        render(args, value) {
          const where = value.mode === 'webdav' ? '☁️ 坚果云' : '📁 本地'
          const text = value.saved
            ? '✅ 已提炼并按主题分类存入知识库 [' + value.topic + ']（' + where + '）→ ' + value.file
            : '❌ 知识保存失败'
          return [{ type: 'text', text }]
        }
      },
      timeoutMs: 30000,
      async execute(args, exec) {
        if (exec.signal && exec.signal.aborted) throw new Error('保存已取消')
        const now = new Date()
        const topicPath = topicSegments(args.topic).join('/')
        const topicDisplay = String(args.topic || '未分类')
        const filename = entryFilename(args, now)
        const markdown = entryMarkdown(args, now)
        const line = indexLine(args, now)

        // 优先 WebDAV（坚果云）
        const auth = await resolveAuth()
        if (auth !== null) {
          const base = WEBDAV_BASE + '/' + enc(KB_DIR)
          const store = {
            get: (rel) => davGet(base + '/' + enc(rel), auth.header, exec.signal),
            put: (rel, content) => davPut(base + '/' + enc(rel), content, auth.header, exec.signal)
          }
          const ensureDirs = async (path) => {
            const segs = path.split('/')
            let cur = base
            for (const s of segs) {
              cur = cur + '/' + enc(s)
              await davEnsureDir(cur, auth.header, exec.signal)
            }
          }
          await saveEntry(store, ensureDirs, topicPath, topicDisplay, filename, markdown, line)
          return { saved: true, file: KB_DIR + '/' + topicPath + '/' + filename, topic: args.topic, root: WEBDAV_BASE, mode: 'webdav' }
        }

        // 回退本地
        const fs = ctx.get('fs')
        if (fs === undefined) throw new Error('fs 服务不可用')
        let root = cwdOf(exec.agent)
        if (root.length === 0) {
          const sessions = ctx.get('sessions')
          if (sessions !== undefined) {
            try {
              const all = sessions.list()
              const found = (all || []).find((s) => s && s.header && typeof s.header.cwd === 'string' && s.header.cwd.length > 0)
              if (found) root = String(found.header.cwd)
            } catch (err) { /* 回退到下一级 */ }
          }
        }
        if (root.length === 0) {
          const policy = ctx.get('sandboxPolicy')
          if (policy !== undefined) {
            const resolved = policy.resolve()
            if (resolved && typeof resolved.workspaceRoot === 'string') root = resolved.workspaceRoot
          }
        }
        root = String(root || '').replace(/[\\/]+$/, '')
        if (root.length === 0) throw new Error('无法确定知识库根目录')
        const writePolicy = { mode: 'workspace-write', workspaceRoot: root }
        const kbDir = root + '/' + KB_DIR
        const store = {
          async get(rel) {
            const t = await fs.resolve(kbDir + '/' + rel)
            return (await fs.stat(t)) ? await fs.readText(t) : null
          },
          async put(rel, content) {
            const t = await fs.resolve(kbDir + '/' + rel)
            await fs.writeText(t, content, undefined, exec.signal, writePolicy)
          }
        }
        const ensureDirs = async () => {}
        await saveEntry(store, ensureDirs, topicPath, topicDisplay, filename, markdown, line)
        return { saved: true, file: KB_DIR + '/' + topicPath + '/' + filename, topic: args.topic, root, mode: 'local' }
      }
    })
  }
}
