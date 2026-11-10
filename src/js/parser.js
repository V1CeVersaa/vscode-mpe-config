// SPDX-License-Identifier: AGPL-3.0-only AND NCSA
// Copyright (c) 2017 ~ 2023 Yiyi Wang. All rights reserved.
// Template source: Crossnote 0.9.42
// The upstream template is under NCSA; locally added logic is under AGPL-3.0-only
// MPE parser hooks: https://shd101wyy.github.io/markdown-preview-enhanced/#/extend-parser
const numberHeadings = require("./heading-numbering.js");
const enhanceTables = require("./table-layout.js");
const material = require("./material.js");

module.exports = {
  async onWillParseMarkdown(markdown) {
    return material.preprocess(markdown);
  },

  async onDidParseMarkdown(html) {
    const numberedHtml = numberHeadings(material.postprocess(html));
    return enhanceTables(numberedHtml);
  },
};
