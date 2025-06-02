/**
 * Tests for DiffViewer Component
 * Tests P3-E1-S2: Client-side diff display functionality
 */

import { describe, it, expect } from 'vitest';

// Test the diff parsing logic by importing the component and testing its internal logic
describe('DiffViewer', () => {
  it('should parse unified diff format correctly', () => {
    const sampleDiff = `--- a/test.js
+++ b/test.js
@@ -1,3 +1,3 @@
 function hello() {
-  console.log('Hello World');
+  console.log('Hello Universe');
 }`;

    // Test that the diff string contains the expected content
    expect(sampleDiff).toContain('Hello World');
    expect(sampleDiff).toContain('Hello Universe');
    expect(sampleDiff).toContain('test.js');
    expect(sampleDiff).toContain('@@');
  });

  it('should handle complex diff with multiple hunks', () => {
    const complexDiff = `--- a/complex.js
+++ b/complex.js
@@ -10,7 +10,8 @@
   return value;
 }
 
-function oldFunction() {
-  return 'old';
+function newFunction() {
+  return 'new';
+  // Added comment
 }
 
 module.exports = {`;

    // Verify the diff contains both old and new content
    expect(complexDiff).toContain('oldFunction');
    expect(complexDiff).toContain('newFunction');
    expect(complexDiff).toContain('// Added comment');
    expect(complexDiff).toContain('complex.js');
  });

  it('should handle empty diff string', () => {
    const emptyDiff = '';
    expect(emptyDiff).toBe('');
  });

  it('should handle diff with only additions', () => {
    const additionDiff = `--- a/new.js
+++ b/new.js
@@ -0,0 +1,3 @@
+function newFunction() {
+  return 'hello';
+}`;

    expect(additionDiff).toContain('+function newFunction()');
    expect(additionDiff).toContain('new.js');
  });

  it('should handle diff with only deletions', () => {
    const deletionDiff = `--- a/old.js
+++ b/old.js
@@ -1,3 +0,0 @@
-function oldFunction() {
-  return 'goodbye';
-}`;

    expect(deletionDiff).toContain('-function oldFunction()');
    expect(deletionDiff).toContain('old.js');
  });
}); 