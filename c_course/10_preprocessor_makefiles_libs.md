# Module 10: Preprocessor, Makefiles & Library Architecture

Real-world C programs and systems utilities are never written in a single file. Understanding how multi-module projects are compiled, linked, and organized is essential for systems engineering and binary inspection.

---

## 1. Header Files & Inclusion Guards

Header files (`.h`) contain declarations: function prototypes, struct definitions, and constants.

If a header is included multiple times across different compilation units, types may be redefined, leading to compiler errors. To prevent this, use **Inclusion Guards**:

```c
// my_module.h
#ifndef MY_MODULE_H
#define MY_MODULE_H

#include <stdint.h>

// Struct declaration
typedef struct {
    uint32_t id;
    char name[32];
} user_t;

// Function prototype
int user_init(user_t *u, uint32_t id, const char *name);

#endif // MY_MODULE_H
```

Alternatively, `#pragma once` is supported by virtually all modern compilers.

---

## 2. Static Libraries (`.a`) vs Shared Libraries (`.so`)

| Property | Static Library (`libxyz.a`) | Shared / Dynamic Library (`libxyz.so`) |
|---|---|---|
| **Creation** | `ar rcs libxyz.a a.o b.o` | `gcc -shared -fPIC -o libxyz.so a.o b.o` |
| **Linking** | Linked at compile-time by `ld` | Resolved at runtime by dynamic linker (`ld.so`) |
| **Binary Size** | Larger (code copied into executable) | Smaller (shared in memory among processes) |
| **Reverse Engineering** | Functions are embedded directly in `.text` | Calls route through `.plt` and `.got` tables |

---

## 3. Writing Professional Makefiles

A `Makefile` defines dependencies and commands to automate compilation:

```makefile
CC ?= gcc
CFLAGS ?= -Wall -Wextra -O2 -g
TARGET = my_app
OBJS = main.o utils.o database.o

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)

.PHONY: all clean
```

---

## Lesson Exercises & Challenges

### Challenge 1: Header Guard Audit
Explain what happens if two headers include each other without guards (Cyclic Dependency).

### Challenge 2: Build a Static Library
Write two C files `math_ops.c` and `main.c`. Compile `math_ops.c` into an object file, package it with `ar`, and link it into `main`.
