# Module 6: Structs, Unions, Alignment & Data Structures

In binary reversing, one of your primary objectives when analyzing an unknown executable is to **reconstruct custom data structures (`struct` definitions)** from assembly instructions.

---

## 1. Struct Memory Layout & Alignment Rules

A `struct` is a contiguous block of memory where members are positioned sequentially. However, CPUs access memory much faster when data addresses are aligned to multiples of their natural size:

* `uint8_t` (1 byte) can be aligned at any address (multiple of 1).
* `uint16_t` (2 bytes) must be aligned at multiples of 2 (`address % 2 == 0`).
* `uint32_t` (4 bytes) must be aligned at multiples of 4 (`address % 4 == 0`).
* `uint64_t` and pointers (8 bytes) must be aligned at multiples of 8 (`address % 8 == 0`).

To enforce this, compilers insert invisible **Padding Bytes** between struct fields:

```c
#include <stdio.h>
#include <stdint.h>

struct Example {
    uint8_t  a;    // 1 byte  (Offset 0)
    // 3 padding bytes inserted here!
    uint32_t b;    // 4 bytes (Offset 4)
    uint8_t  c;    // 1 byte  (Offset 8)
    // 7 padding bytes inserted here!
    uint64_t d;    // 8 bytes (Offset 16)
}; // Total size: 24 bytes!
```

### Visual Memory Layout:
```
Offset:  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16 ... 23
Field:  [a] [ PADDING ] [       b       ]  [c] [       PADDING       ]  [     d     ]
Bytes:   1       3               4          1             7                  8
```

> **Reverse Engineering Rule:** The total size of a struct is always padded to be an even multiple of the struct's **largest member alignment** (here, 8 bytes).

---

## 2. Packed Structs: Disabling Padding

When communicating over a network socket or parsing binary file headers on disk, fields must have zero padding bytes. We force this using `#pragma pack` or attributes:

```c
#pragma pack(push, 1)
struct PacketHeader {
    uint8_t  magic;     // 1 byte  (Offset 0)
    uint32_t payload_len; // 4 bytes (Offset 1)
    uint16_t checksum;  // 2 bytes (Offset 5)
}; // Total size: exactly 7 bytes!
#pragma pack(pop)
```

---

## 3. Unions & Low-Level Type Punning

A `union` stores different data types in the **exact same memory location**. The size of a union is simply the size of its largest member:

```c
#include <stdio.h>
#include <stdint.h>

union FloatBits {
    float    f;
    uint32_t u;
};

int main(void) {
    union FloatBits conv;
    conv.f = -1.0f;

    // View IEEE 754 raw bit pattern of -1.0f
    printf("Float: %f, Hex bits: 0x%08X\n", conv.f, conv.u);
    // Output: Float: -1.000000, Hex bits: 0xBF800000
    return 0;
}
```

---

## 4. Reconstructing Structs from Disassembly

When a C function accesses a struct pointer `struct Player *p`, the compiler emits register-relative loads and stores with fixed offsets:

```c
void update_player(struct Player *p) {
    p->health += 10;
    p->score += 500;
}
```

### In Assembly (ARM64):
```assembly
update_player:
    // x0 holds the base pointer to struct Player
    ldr     w1, [x0, #4]       // Offset 4: health (32-bit int)
    add     w1, w1, #10
    str     w1, [x0, #4]

    ldr     x2, [x0, #16]      // Offset 16: score (64-bit int)
    add     x2, x2, #500
    str     x2, [x0, #16]
    ret
```

### The Reverse Engineer's Analysis:
1. `[x0, #0]` is unknown (likely a 4-byte id or name pointer).
2. `[x0, #4]` is loaded with `ldr w1` (32-bit register) -> `uint32_t health` at offset 4!
3. `[x0, #8]` or `[x0, #12]` is padding or other fields.
4. `[x0, #16]` is loaded with `ldr x2` (64-bit register) -> `uint64_t score` at offset 16!

You can now feed this struct layout directly into IDA Pro, Ghidra, or your C header definitions!

---

## Lesson Exercises & Challenges

### Challenge 1: Compute Struct Size & Offsets
Calculate `sizeof` and member offsets for:
```c
struct SensorData {
    char tag;
    double reading;
    short status;
    int id;
};
```
Assume 64-bit architecture. What is `sizeof(struct SensorData)`? How can you reorder the fields to minimize padding?

### Challenge 2: Reconstruct Struct from Ghidra Output
Given the disassembly snippet:
```assembly
strb    w1, [x0]
strh    w2, [x0, #2]
str     w3, [x0, #4]
str     x4, [x0, #8]
```
Write the corresponding C `struct` definition with proper types for each field.
