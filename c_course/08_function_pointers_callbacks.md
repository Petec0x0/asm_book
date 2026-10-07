# Module 8: Function Pointers, Callbacks & Dynamic Dispatch

In compiled C, code and data reside in the same physical memory space. A function is simply a sequence of machine instructions at a specific memory address, and a **Function Pointer** is an address variable that points to that code.

---

## 1. Syntax of Function Pointers

Declaring a function pointer in C has a notorious syntax:

```c
#include <stdio.h>

int add(int a, int b) { return a + b; }
int sub(int a, int b) { return a - b; }

int main(void) {
    // Declares 'op' as a pointer to a function taking (int, int) and returning int
    int (*op)(int, int);

    op = add;
    printf("Add: %d\n", op(10, 5)); // 15

    op = sub;
    printf("Sub: %d\n", op(10, 5)); // 5
    return 0;
}
```

### Using `typedef` for Clarity
In production systems and reverse engineering, function pointers are always defined using `typedef`:

```c
typedef int (*math_op_fn)(int, int);

math_op_fn current_op = add;
```

---

## 2. Callbacks & Virtual Tables (vtables) in C

The Linux kernel and large C systems (like Git or SQLite) use structs containing function pointers to achieve object-oriented polymorphism:

```c
// Emulating an Object-Oriented Interface in C:
struct DriverVTable {
    int (*open)(const char *path);
    int (*read)(void *buf, size_t count);
    int (*write)(const void *buf, size_t count);
    void (*close)(void);
};

struct Device {
    int id;
    const struct DriverVTable *ops; // Pointer to function table!
};
```

---

## 3. Disassembly: Direct Calls vs Indirect Calls

In reverse engineering, distinguishing between direct and indirect calls is crucial:

### Direct Call:
```assembly
bl      _printf          // Target address is hardcoded into the instruction
```

### Indirect Call (Function Pointer):
```assembly
ldr     x3, [x0, #16]    // Load function pointer from struct offset 16
blr     x3               // Branch with Link to Register x3!
```

> **Reverse Engineering Rule:** When you see `blr xRegister` (ARM64) or `call *%rax` (x86_64), the program is invoking a function pointer or C++ virtual method.

---

## 4. Security Significance: Control-Flow Hijacking

Because indirect calls jump to whatever address is loaded into the register, **overwriting a function pointer in memory is one of the most reliable exploitation techniques**:
* Overwriting a function pointer in a struct
* Overwriting a destructor or exit handler (`atexit`)
* Overwriting the Global Offset Table (`.got.plt`)

When the indirect call instruction executes, CPU control jumps immediately to the attacker's payload.

---

## Lesson Exercises & Challenges

### Challenge 1: Command Dispatch Table
Write a calculator in C using an array of function pointers `math_op_fn dispatch[4]` corresponding to `['+', '-', '*', '/']`. Execute operations based on user index without using `switch` or `if`.

### Challenge 2: Identify the Hook
Look at the following pseudo-C decompilation:
```c
struct Hook {
    char name[16];
    void (*callback)(int code);
};
```
If an input buffer overflows into `callback`, what address would an attacker supply to redirect execution to a function at `0x00401337`?
