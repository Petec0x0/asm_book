# Module 7: Dynamic Memory & Heap Internals

While local variables live briefly on the stack, dynamic memory is managed on the **Heap**. In software security and exploitation, heap vulnerabilities represent the vast majority of modern zero-day bugs in browsers, kernels, and network services.

---

## 1. How the OS Allocates Heap Memory: `brk` and `mmap`

The C library (`libc`) does not own physical memory. When your program starts, `malloc()` requests memory from the kernel using two low-level system calls:

1. **`brk()` / `sbrk()`:** Extends the break pointer of the process data segment upward in memory for small-to-medium allocations.
2. **`mmap()`:** Maps new anonymous virtual memory pages anywhere in the address space (used for large allocations, typically $\ge 128$ KB).

---

## 2. Dynamic Memory API: `malloc`, `calloc`, `realloc`, `free`

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void heap_basics(void) {
    // 1. malloc: Allocates uninitialized memory
    int *numbers = (int *)malloc(5 * sizeof(int));
    if (!numbers) return; // Always check for NULL!

    // 2. calloc: Allocates AND zeroes memory
    int *zeroed = (int *)calloc(5, sizeof(int));

    // 3. realloc: Resizes an existing block (may relocate it!)
    int *larger = (int *)realloc(numbers, 10 * sizeof(int));
    if (larger) numbers = larger;

    // 4. free: Releases memory back to the allocator
    free(numbers);
    numbers = NULL; // Best practice: avoid dangling pointer!
    free(zeroed);
}
```

---

## 3. Glibc Heap Chunk Internals (ptmalloc)

When you call `malloc(24)`, the allocator does not just allocate 24 bytes. It prepends an invisible **Chunk Header**:

```
+------------------------------------+ Chunk Header (16 bytes on 64-bit)
| prev_size (8 bytes)                | Size of previous chunk (if free)
+------------------------------------+
| size | A | M | P (8 bytes)         | Chunk size + Status flags (P = PREV_INUSE)
+------------------------------------+ <-- Pointer returned to user by malloc()
| User Data Payload                  |
| (Requested bytes + alignment pad)  |
+------------------------------------+
```

* **`P` Flag (PREV_INUSE):** Bit 0 of size indicates whether the preceding chunk is free or in use. If `0`, the allocator will coalesce adjacent free chunks.

---

## 4. The Critical Heap Vulnerabilities

### 1. Use-After-Free (UAF)
Occurs when a pointer is used after the memory it points to has been released:

```c
struct User {
    void (*speak)(void);
    char name[32];
};

struct User *u = malloc(sizeof(struct User));
u->speak = normal_greeting;
free(u); // Memory returned to freelist!

// VULNERABILITY: Pointer 'u' is dangling!
// If an attacker allocates a new object that reuses this chunk,
// they can overwrite the 'speak' function pointer!
u->speak(); // Control-flow hijacking!
```

### 2. Double-Free
Calling `free()` twice on the exact same pointer:
```c
char *p = malloc(64);
free(p);
free(p); // Corrupts the allocator's tcache / fastbin linked list!
```

---

## 5. Detecting Heap Bugs: AddressSanitizer (ASan)

Modern systems developers compile with AddressSanitizer to catch heap bugs instantly at runtime:

```bash
gcc -fsanitize=address -g program.c -o program
./program
```
ASan will immediately crash the program and print a detailed stack trace explaining whether the bug was a Heap Use-After-Free, Global Buffer Overflow, or Double-Free.

---

## Lesson Exercises & Challenges

### Challenge 1: Identify the Heap Leak
Find the memory leak in this function:
```c
char *format_message(const char *prefix, const char *msg) {
    char *buf1 = malloc(64);
    char *buf2 = malloc(128);
    snprintf(buf1, 64, "[%s] ", prefix);
    snprintf(buf2, 128, "%s%s", buf1, msg);
    return buf2;
}
```
*Fix:* Which pointer was not freed before returning?

### Challenge 2: Implement a Safe Wrapper
Implement `void safe_free(void **ptr_addr)` that frees the memory and automatically sets the caller's pointer variable to `NULL` to prevent dangling pointers.
