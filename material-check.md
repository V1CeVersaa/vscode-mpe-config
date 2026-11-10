# Material 语法回归页

升级 MPE 或 VS Code 后打开这一页。所有块都应该正常渲染，不应该看到 `!!!`、`???`、`===`、`#!python`、`++` 这些原文。

!!! Info "普通提示块，标题不带引号"
    正文 **粗体**

!!! note ""
    这一块没有标题栏

???+ Abstract "默认展开"
    - [x] 勾选框

???- Info "默认折叠，标题里有 `#!python len(x)`"
    点开可见

=== "选项卡 A"
    第一页

=== "选项卡 B"
    第二页，点击能切换

行内高亮：`#!python def f(x): return "s" if x > 1 else None`，`#!cpp int a;`

按键：++ctrl+alt+del++ 和 ++cmd+k++

图标：:material-github: :fontawesome-solid-download: :octicons-link-external-16:

Critic：{++插入++} {--删除--} {~~旧~>新~~} {==高亮==}

```py title="foo.py"
print(1)
```
