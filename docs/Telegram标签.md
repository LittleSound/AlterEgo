以下是最新的 Telegram Bot API 支持的 HTML 标签信息，帮你整理如下：

⸻

Telegram Bot API HTML 模式支持的标签列表

根据 Telegram 官方文档（Bot API 5.6，发布于 2021 年 12 月）：

支持的标签：
	•	粗体：<b> ... </b>、<strong> ... </strong>
	•	斜体：<i> ... </i>、<em> ... </em>
	•	下划线：<u> ... </u>、<ins> ... </ins>
	•	删除线：<s> ... </s>、<strike> ... </strike>、<del> ... </del>
	•	剧透（spoiler）：<span class="tg-spoiler"> ... </span>
	•	链接：
	•	普通 URL：<a href="http://example.com">...​</a>
	•	用户 mention（无用户名）: <a href="tg://user?id=123...">...​</a>
	•	代码格式：
	•	行内代码：<code>...</code>
	•	多行/格式化代码块：<pre>...</pre>
	•	支持语言：<pre><code class="language-python">...</code></pre>
￼ ￼

⸻

此外，根据一些开发社区反馈和实测，还发现支持以下标签：
	•	剧透标签扩展：<tg-spoiler> ... </tg-spoiler>
	•	块引用（blockquote）：
	•	普通块引用：<blockquote> ... </blockquote>
	•	可展开块引用：<blockquote expandable> ... </blockquote>
	•	自定义表情标签（需 Fragment 支持）：<tg-emoji emoji-id="..."></tg-emoji>
￼

⸻

Web 社区（如 Latenode）提到的实用提示：
	•	换行（line break）：不能使用 <br>，应手动使用 \n 文本换行
	•	列表（list）：<ul> / <li> 不支持，推荐用 • item1\n• item2 模拟
	•	电话链接：支持 <a href="tel:+123456789">call me</a>，但是否可点击取决于不同客户端
	•	可用标签补充：<u>（下划线）、<s>（删除线）、<tg-spoiler>（剧透）等也被实测可用
￼

⸻

综合表格（Telegram HTML 支持标签）

功能分类	支持的 HTML 标签或方式
加粗	<b>, <strong>
斜体	<i>, <em>
下划线	<u>, <ins>
删除线	<s>, <strike>, <del>
剧透	<span class="tg-spoiler">, <tg-spoiler>
超链接	<a href="http://...">..., <a href="tg://user?id=...">...
行内代码	<code>
多行代码块	<pre>, <pre><code class="language-...">
块引用	<blockquote>, <blockquote expandable>
自定义表情	<tg-emoji emoji-id="..."></tg-emoji>（需特定支持）
换行	使用 \n，HTML 不支持 <br> 标签
列表（模拟）	使用文本符号与换行，如 • item1\n• item2
电话链接	<a href="tel:+123...">...</a>（客户端支持可能有差异）

⸻

小结建议
	1.	严格使用官方文档支持的标签，避免使用 <br>, <ul>, <li> 等不支持的 HTML。
	2.	使用 \n 实现换行，并用符号模拟列表。
	3.	格式要严格闭合、语法正确，否则可能导致整个消息解析失败。
	4.	若你想在 Telegram 实现更丰富的样式（如可展开的块引、spoiler、代码高亮等），可以使用 <blockquote expandable>、<span class="tg-spoiler"> 或 <pre><code class="language-..."> 等标签组合。

如果你有具体的排版样式想实现，比如把某段文字变成可折叠引用，或者插入行内代码块，我可以帮你一起写示例代码！
