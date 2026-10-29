# Expo Harmony CLI 软件设计说明书重写实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于提供的 Word 模板和当前 CLI 项目事实，输出一份原生文字可编辑且通过版式核验的 V1.4.0 软件设计说明书。

**已核验纠错：** 原模板没有独立目录或TOC域，禁止执行旧计划中插入目录的步骤。以 `softcopyright-output/rebuild/artifact.md` 为最终执行契约，克隆原模板实际段落格式，正文使用 `manuscript.md`。保留五章结构与PAGE域；运行输出图保留完整日志证据；逐页渲染验收。旧计划中“目录核验”改为“章节结构核验”。用户已授权继续，无需再次确认。

**Architecture:** 以原始模板 DOCX 为工作副本并保留其两个节、页眉页脚、封面和样式；用 `python-docx` 填充原生文本、表格和代码段，采用模板已有样式。结构图、流程图和项目终端/运行截图作为局部图片插入，所有正文仍保持可编辑的 Word 文本。

**Tech Stack:** Python 3（Codex bundled runtime）、python-docx、Pillow、模板 OOXML、LibreOffice 渲染器、项目现有 TypeScript 源码与 Vitest 测试。

## Global Constraints

- 软件名称固定为“基于 Expo 跨端体系的可复用标准化多端项目脚手架系统”，版本固定为 `V1.4.0`。
- 严格保留模板的 A4 页面系统、封面结构、两节设置、页眉横线、页码、标题层级和目录格式。
- 正文使用原生可编辑 Word 段落、表格、列表、代码块；整页正文不得转换为图片。
- 事实仅来自 `apps/cli/README.md`、`apps/cli/docs/guide.md`、`apps/cli/src` 和已有测试；不引入参考样例的 MCP 项目事实。
- 目标 28–36 页，原生文本不少于 2,000 字；图、表、截图均带连续编号和说明。
- 不改动模板/参考原文件或项目功能代码；不提交 Git 变更。

---

### Task 1: 固化模板和项目事实契约

**Files:**
- Create: `softcopyright-output/rebuild/template-contract.md`
- Create: `softcopyright-output/rebuild/project-facts.md`
- Test: `softcopyright-output/rebuild/validate_contract.py`

**Interfaces:**
- Consumes: 模板 DOCX、参考设计说明书、`README.md`、`docs/guide.md`、`apps/cli/src`。
- Produces: 模板版式值、固定目录、版本一致性规则，以及各章节可追溯的事实清单。

- [ ] **Step 1: 写出失败的事实完整性测试**

```python
def test_contract_contains_all_template_chapters_and_v140_facts(contract):
    assert contract['chapters'] == ['1.产品描述', '2.产品需求概述', '3.功能需求', '4.性能需求', '5.UI设计说明']
    assert contract['version'] == 'V1.4.0'
    assert {'create', 'install', 'prebuild', 'sync', 'doctor'} <= set(contract['commands'])
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python softcopyright-output/rebuild/validate_contract.py`

Expected: 因契约文件尚不存在或缺失必填章节/命令而失败。

- [ ] **Step 3: 从模板、样例和源码生成事实契约**

记录两个节的边距、页眉页脚、封面槽位、标题样式、目录层级；并将 SDK 矩阵、命令、兼容策略、自动链接、受管状态、运行支撑与对应源码路径写入项目事实清单。

- [ ] **Step 4: 运行测试确认通过**

Run: `python softcopyright-output/rebuild/validate_contract.py`

Expected: PASS；所有必填章节、版本和命令均在契约中。

### Task 2: 编写可编辑的说明书正文与图表素材

**Files:**
- Create: `softcopyright-output/rebuild/content-outline.md`
- Create: `softcopyright-output/rebuild/figures/`
- Create: `softcopyright-output/rebuild/screenshots/`
- Test: `softcopyright-output/rebuild/validate_content.py`

**Interfaces:**
- Consumes: Task 1 的 `project-facts.md`。
- Produces: 五章正文、表格数据、关键函数清单、图表和版本一致的截图。

- [ ] **Step 1: 写出失败的正文覆盖测试**

```python
def test_content_has_native_text_budget_and_required_design_topics(outline):
    assert len(outline['native_text']) >= 4000
    for topic in ['版本矩阵', '兼容策略', '自动链接', '受管状态', '事务回滚', '环境诊断', 'Release']:
        assert topic in outline['native_text']
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python softcopyright-output/rebuild/validate_content.py`

Expected: 因正文、图题或截图尚未生成而失败。

- [ ] **Step 3: 编写章节正文并生成图表素材**

正文严格按模板五章和设计规范的 3.1–3.10 展开。图表包括总体结构、命令分发、创建、扫描、安装/卸载、预构建、工程生成、自动链接、漂移保护、数据关系和运行流程；截图使用 CLI 的 V1.4.0 实际输出或真实源码片段，避免未对应版本的信息。

- [ ] **Step 4: 运行测试确认通过**

Run: `python softcopyright-output/rebuild/validate_content.py`

Expected: PASS；原生文本预算充足，所有关键设计主题、图题和截图来源完整。

### Task 3: 从模板工作副本构建原生 Word 说明书

**Files:**
- Create: `softcopyright-output/rebuild/build_design_doc.py`
- Create: `softcopyright-output/基于 Expo 跨端体系的可复用标准化多端项目脚手架系统 V1.4.0 软件设计说明书.docx`
- Test: `softcopyright-output/rebuild/validate_docx_structure.py`

**Interfaces:**
- Consumes: Task 1 的模板契约和 Task 2 的正文/素材。
- Produces: 基于模板的可编辑 DOCX、连续图表编号和目录字段。

- [ ] **Step 1: 写出失败的 DOCX 结构测试**

```python
def test_docx_preserves_template_sections_and_has_editable_body(doc):
    assert section_count(doc) == 2
    assert has_template_header_rule(doc)
    assert text_char_count(doc) >= 2000
    assert image_coverage_ratio(doc) < 0.45
    assert all(chapter in extracted_text(doc) for chapter in REQUIRED_CHAPTERS)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python softcopyright-output/rebuild/validate_docx_structure.py`

Expected: 因最终 DOCX 尚不存在而失败。

- [ ] **Step 3: 用模板工作副本填充原生正文**

只替换封面槽位、页眉文字槽位和正文；克隆模板一级、二级标题与正文的实际段落格式，不引入参考样例的额外样式。保留PAGE域并设置打开Word时更新；每张图紧跟图题，表格使用原生结构。页脚、节属性、边距和未改动模板部件必须保留；不插入目录。

- [ ] **Step 4: 运行测试确认通过**

Run: `python softcopyright-output/rebuild/validate_docx_structure.py`

Expected: PASS；两节、模板页眉页脚、原生文本数量、章节覆盖和图片占比均符合要求。

### Task 4: 渲染、目录和交付验收

**Files:**
- Create: `softcopyright-output/rebuild/qa/`
- Modify: `softcopyright-output/基于 Expo 跨端体系的可复用标准化多端项目脚手架系统 V1.4.0 软件设计说明书.docx`
- Test: `softcopyright-output/rebuild/validate_final.py`

**Interfaces:**
- Consumes: Task 3 的 DOCX。
- Produces: 通过文本、样式、图像、页数和视觉核验的最终 DOCX。

- [ ] **Step 1: 写出失败的最终验收测试**

```python
def test_final_document_meets_delivery_gate(result):
    assert 28 <= result.page_count <= 36
    assert result.version_mismatches == []
    assert result.unrendered_or_clipped_pages == []
    assert result.table_overflow_pages == []
    assert result.toc_matches_headings is True
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python softcopyright-output/rebuild/validate_final.py`

Expected: 初次渲染或目录比对至少发现未更新字段、分页或版式问题。

- [ ] **Step 3: 渲染并修复所有可见问题**

使用 packaged `render_docx.py` 生成逐页 PNG；审查每页正文、表格、图片、图题、页眉页脚和页码。必要时调整原生段落/表格/图片尺寸并重复渲染。以 Word 目录字段和提取文本交叉检查目录、标题、版本号及页数。

- [ ] **Step 4: 运行测试确认通过并复制到桌面**

Run: `python softcopyright-output/rebuild/validate_final.py`

Expected: PASS；页数、目录、版本、文本可编辑性及所有视觉页均通过。随后将最终 DOCX 复制到桌面同名文件。

## Self Review

- 规格覆盖：任务 1 固化模板和事实，任务 2 完成内容与图证，任务 3 生成可编辑 Word，任务 4 完成版式和交付验收，覆盖设计规范全部要求。
- 占位检查：未使用 TBD、TODO 或“后续补充”等不可执行措辞。
- 接口一致性：四项任务依次消费前一任务的明确产物，输出路径与版本号保持一致。
