"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3456;

const DATA_DIR = path.join(__dirname, "data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Create a default welcome file
  const welcomePath = path.join(DATA_DIR, "welcome.md");
  const welcomeContent = `# 👋 Welcome to Markdown Editor

## 欢迎使用 Markdown 编辑器

This is a real Node.js Markdown editor with live preview.

- **Left panel**: Write your Markdown here
- **Right panel**: See the rendered preview
- **Sidebar**: Manage your files

---

### Features / 功能

| Feature | Description |
|---------|-------------|
| 🌓 Dark/Light Mode | Toggle theme with one click |
| 🌐 i18n | Switch between Chinese and English |
| 💾 Auto-save | Changes are saved automatically |
| 📂 File Manager | Create, rename, and delete files |

---

> Start writing and enjoy! 开始写作吧！
`;
  fs.writeFileSync(welcomePath, welcomeContent, "utf-8");
}

// Body parser for JSON
app.use(express.json({ limit: "10mb" }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// --- API Routes ---

// List all markdown files
app.get("/api/files", (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith(".md"))
      .map(f => ({ name: f, path: f }));
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Read a file
app.get("/api/files/:name", (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: "File not found" });
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const stat = fs.statSync(filePath);
    res.json({
      success: true,
      file: { name: req.params.name, content, mtime: stat.mtime }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new file
app.post("/api/files", (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.endsWith(".md")) {
      return res.status(400).json({ success: false, error: "File name must end with .md" });
    }
    const filePath = path.join(DATA_DIR, name);
    if (fs.existsSync(filePath)) {
      return res.status(409).json({ success: false, error: "File already exists" });
    }
    fs.writeFileSync(filePath, "# " + name.replace(".md", "") + "\n\nStart writing here...\n", "utf-8");
    res.json({ success: true, file: { name } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save (write) a file
app.put("/api/files/:name", (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, req.params.name);
    const { content } = req.body;
    if (typeof content !== "string") {
      return res.status(400).json({ success: false, error: "Content must be a string" });
    }
    fs.writeFileSync(filePath, content, "utf-8");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a file
app.delete("/api/files/:name", (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: "File not found" });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rename a file
app.patch("/api/files/:name/rename", (req, res) => {
  try {
    const oldPath = path.join(DATA_DIR, req.params.name);
    const { newName } = req.body;
    if (!newName || !newName.endsWith(".md")) {
      return res.status(400).json({ success: false, error: "New name must end with .md" });
    }
    const newPath = path.join(DATA_DIR, newName);
    if (fs.existsSync(newPath)) {
      return res.status(409).json({ success: false, error: "Target name already exists" });
    }
    fs.renameSync(oldPath, newPath);
    res.json({ success: true, file: { name: newName } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Fallback to index.html for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`📝 Markdown Editor running at http://localhost:${PORT}`);
  console.log(`📂 Data directory: ${DATA_DIR}`);
});
