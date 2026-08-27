#!/usr/bin/env node
/**
 * Build script: creates crt-tv.zip for easy OBS import.
 * Excludes node_modules, .git, and development artifacts.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const zipName = 'crt-tv.zip';
const tempDir = join(__dirname, '_build');

// Clean previous build
if (existsSync(tempDir)) {
    execSync(`rm -rf ${tempDir}`, { shell: true });
}
mkdirSync(tempDir, { recursive: true });

// Copy source files
const files = [
    'crt-tv.html',
    'crt-tv.js',
    'glitches.js',
    'README.md',
    'DESIGN.md',
    'fonts/',
    'media/',
    'render.mjs',
];

files.forEach(f => {
    const src = join(__dirname, f);
    const dst = join(tempDir, f);
    if (existsSync(src)) {
        execSync(`cp -r ${src} ${dst}`, { shell: true });
    }
});

// Create zip
const zipPath = join(__dirname, zipName);
execSync(`zip -r ${zipPath} ${tempDir}/*`, { shell: true });

// Clean up
execSync(`rm -rf ${tempDir}`, { shell: true });

console.log(`Created ${zipPath}`);
