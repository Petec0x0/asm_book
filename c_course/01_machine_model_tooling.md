# Module 1: The Machine Model, Tooling & The Compilation Pipeline

Understanding C as a reverse engineer starts with understanding **how C code actually transforms into machine instructions** and how those instructions are packaged into binary executables.

---

## 1. The Machine Model: What C Actually Abstracts

High-level languages like Python or JavaScript run on top of virtual machines or interpreters that manage memory and garbage collection. C has no runtime interpreter, no garbage collector, and no safety net.

When you write C, you are directly directing the CPU and manipulating the system's **Virtual Address Space**:

```
+------------------------------------+ High Memory (0x7FFFFFFFFFFF)
| Stack Segment                      | Grows DOWNWARDS (Local variables, return addresses)
|         |                          |
|         v                          |
|                                    |
|         ^                          |
|         |                          |
| Heap Segment                       | Grows UPWARDS (malloc, calloc, dynamic allocations)
+------------------------------------+
| BSS Segment (.bss)                 | Uninitialized global & static variables (zero-filled)
+------------------------------------+
| Data Segment (.data)               | Initialized global & static variables
+------------------------------------+
| Read-Only Data (.rodata)           | String literals, constant lookup tables
+------------------------------------+
| Text Segment (.text)               | Executable machine instructions (read & execute only)
+------------------------------------+ Low Memory (0x00400000)
```

In reverse engineering, whenever you encounter a pointer, variable, or instruction, you are locating it within one of these specific memory segments.

---

## 2. The 4 Stages of the Compilation Pipeline

A common misconception is that running `gcc main.c -o main` performs a single monolithic task. In reality, GCC executes **four distinct tools** sequentially:

```
Source Code (.c)
     |
     | 1. Preprocessor (cpp / gcc -E)
     v
Expanded Source (.i)
     |
     | 2. Compiler Proper (cc1 / gcc -S)
     v
Assembly Source (.s)
     |
     | 3. Assembler (as / gcc -c)
     v
Relocatable Object (.o)
     |
     | 4. Linker (ld / gcc)
     v
Executable Binary (ELF / Mach-O / PE)
```

### Stage 1: The Preprocessor (`gcc -E`)
Resolves all `#include`, `#define`, and conditional `#ifdef` directives.
* It pastes the entire contents of included header files directly into the file.
* It replaces macro constants with literal text.
* Try it:
```bash
gcc -E main.c -o main.i
```

### Stage 2: The Compiler Proper (`gcc -S`)
Translates the preprocessed C code into architecture-specific assembly instructions (`.s`).
* Syntax checking, type checking, and compiler optimizations (`-O0`, `-O2`, `-O3`) happen here.
* Try it:
```bash
gcc -S -O0 main.c -o main.s
```

### Stage 3: The Assembler (`gcc -c` or `as`)
Translates textual assembly mnemonics (`mov`, `add`, `ldr`) into raw machine code opcodes (bytes) inside a relocatable ELF object file (`.o`).
* Try it:
```bash
gcc -c main.c -o main.o
```

### Stage 4: The Linker (`ld`)
Combines multiple object files, resolves external symbol references (such as `printf` from `libc`), assigns virtual memory addresses to sections, and produces the final executable.

---

## 3. Reverse Engineering Tooling Walkthrough

When analyzing an unknown binary file, you use standard Unix binary utilities before opening heavy debuggers or decompilers:

### `file` - Identifying Architecture and Binary Format
```bash
file my_program
# Output: my_program: ELF 64-bit LSB pie executable, ARM aarch64, version 1 (SYSV), dynamically linked...
```
* **64-bit LSB:** 64-bit architecture, Least Significant Byte first (Little-Endian).
* **ARM aarch64:** The CPU instruction set.
* **dynamically linked:** Uses shared libraries (e.g., `libc.so.6`).
* **stripped vs not stripped:** If "not stripped", function and variable names are preserved in the symbol table!

### `readelf` - Inspecting ELF Headers and Sections
```bash
readelf -h my_program       # View ELF header (entry point address, machine type)
readelf -S my_program       # View section headers (.text, .data, .rodata)
```

### `objdump` - Disassembling Machine Code
```bash
objdump -d -M intel my_program    # x86 disassembly
objdump -d my_program             # ARM64 disassembly
```

### `nm` - Listing Symbols
```bash
nm -D my_program            # Lists dynamically imported/exported symbols
```

### `strings` - Extracting ASCII & Unicode Strings
```bash
strings -n 6 my_program     # Shows printable strings with at least 6 characters
```

---

## 4. Hands-on Code Example

Let's look at a simple C program and examine how each tool treats it:

```c
// hello.c
#include <stdio.h>

const char *secret_key = "FLAG{RE_IS_AWESOME}";

int main(void) {
    printf("Welcome to Reverse Engineering in C!\n");
    return 0;
}
```

Compile and inspect:
1. `strings hello | grep FLAG` immediately recovers `"FLAG{RE_IS_AWESOME}"` because string literals reside unencrypted in `.rodata`!
2. `objdump -d hello` reveals the `main` function calling `puts` or `printf`.

---

## 5. Reverse Engineering Takeaway

> **Rule 1 of Reverse Engineering:**
> The compiler is an optimizer and an information destroyer. It strips variable names (unless compiled with `-g`), inlines functions, unrolls loops, and transforms high-level abstractions into raw memory offsets and register assignments. Understanding C allows you to reverse this transformation and reconstruct the developer's original intent.

---

## Lesson Exercises & Challenges

### Challenge 1: The Preprocessor Detective
Compile the following code with `gcc -E` and observe what the macro expansion produces:
```c
#define MULTIPLY(a, b) a * b
int x = MULTIPLY(3 + 2, 4 + 1); // What is x evaluated to?
```
*Question:* Is `x` equal to 25? Why does macro substitution yield `3 + 2 * 4 + 1 = 12`? How do parentheses `#define MULTIPLY(a, b) ((a) * (b))` fix this?

### Challenge 2: Symbol Extraction
Write a small C program with one static global function `static int helper()` and one regular global function `int exported()`. Compile with `gcc -c test.c`. Run `nm test.o`. Note the symbol binding types (`t` for local/static vs `T` for global).
