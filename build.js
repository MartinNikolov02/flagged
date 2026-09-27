const fs = require("fs");
const path = require("path");

const srcFiles = ["index.html", "manifest.json"];
const srcDirs = ["css", "js", "assets"];
const outDir = "www";

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);

for (const file of srcFiles) {
  fs.copyFileSync(file, path.join(outDir, file));
}
for (const dir of srcDirs) {
  fs.cpSync(dir, path.join(outDir, dir), { recursive: true });
}

console.log("Copied game files into www/");