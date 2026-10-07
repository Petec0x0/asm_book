# Module 2: Data Types, Memory Representation & Bitwise Logic

In high-level languages, a number is just a number. In C and reverse engineering, a number is a **fixed sequence of bits** stored in physical memory according to strict representation rules.

---

## 1. Fixed-Width Types & System Architecture

On modern 64-bit platforms (x86_64 and AArch64 Linux/macOS), type sizes follow the LP64 data model:

| C Standard Type | Exact Width Type (`<stdint.h>`) | Size (Bytes) | Size (Bits) | Unsigned Range | Signed Range (Two's Complement) |
|---|---|---|---|---|---|
| `char` | `int8_t` / `uint8_t` | 1 | 8 | 0 to 255 | -128 to 127 |
| `short` | `int16_t` / `uint16_t` | 2 | 16 | 0 to 65,535 | -32,768 to 32,767 |
| `int` | `int32_t` / `uint32_t` | 4 | 32 | 0 to 4,294,967,295 | -2,147,483,648 to 2,147,483,647 |
| `long` / `long long` | `int64_t` / `uint64_t` | 8 | 64 | 0 to 18,446,744,073,709,551,615 | -9.22 × 10¹⁸ to 9.22 × 10¹⁸ |
| `void *` (pointers) | `uintptr_t` | 8 | 64 | 0 to 2⁶⁴ - 1 | N/A |

> **Best Practice:** When writing systems software or analyzing binary structures, always prefer `<stdint.h>` types (`uint32_t`, `uint64_t`) because plain `int` and `long` can vary across 32-bit and 64-bit operating systems (e.g. Windows LLP64 vs Linux LP64).

---

## 2. Two's Complement: How Computers Store Negative Numbers

Computers represent signed integers using **Two's Complement**:
1. To negate a number: invert all bits (`~x`) and add 1 (`+ 1`).
2. The Most Significant Bit (MSB) acts as the sign bit:
   * `0` = positive or zero
   * `1` = negative

### Example with 8-bit Integer:
* `+5` in binary: `0000 0101`
* Invert bits: `1111 1010`
* Add 1: `1111 1011` = `-5` (Hex `0xFB`)
* `-1` in binary: `1111 1111` (Hex `0xFF`)

```c
#include <stdio.h>
#include <stdint.h>

int main(void) {
    int8_t signed_val = -1;
    uint8_t unsigned_val = (uint8_t)signed_val;

    printf("Signed: %d, Unsigned: %u, Hex: 0x%02X\n", signed_val, unsigned_val, unsigned_val);
    // Output: Signed: -1, Unsigned: 255, Hex: 0xFF
    return 0;
}
```

---

## 3. Endianness: Little-Endian vs Big-Endian

Endianness defines the **byte order** in which multi-byte integers are stored in consecutive memory addresses:

* **Little-Endian (x86_64, ARM64):** The **Least Significant Byte (LSB)** is stored at the lowest memory address.
* **Big-Endian (Network Byte Order, SPARC):** The **Most Significant Byte (MSB)** is stored at the lowest memory address.

### The 32-bit Integer `0x12345678`:

```
Byte Values:   MSB = 0x12,   0x34,   0x56,   LSB = 0x78

Memory Address:    Base + 0    Base + 1    Base + 2    Base + 3
-----------------------------------------------------------------
Little-Endian:      0x78        0x56        0x34        0x12
Big-Endian:         0x12        0x34        0x56        0x78
```

### Inspecting Endianness in C:
```c
#include <stdio.h>
#include <stdint.h>

int main(void) {
    uint32_t value = 0x12345678;
    uint8_t *byte_ptr = (uint8_t *)&value;

    printf("Memory byte dump: ");
    for (int i = 0; i < 4; i++) {
        printf("0x%02X ", byte_ptr[i]);
    }
    printf("\n");
    // On x86_64 / ARM64 Linux: prints 0x78 0x56 0x34 0x12
    return 0;
}
```

> **Reverse Engineering Rule:** When examining memory in GDB (`x/4xb &value`) or reading hex dumps in Ghidra, multi-byte values appear backwards relative to human reading order.

---

## 4. Bitwise Operators & System Bitmasking

Bitwise operations are fundamental in operating systems for flags, device drivers, permissions, and network protocols:

| Operator | Name | Effect |
|---|---|---|
| `&` | Bitwise AND | 1 only if both bits are 1 (Used to **mask/extract** bits) |
| `\|` | Bitwise OR | 1 if either bit is 1 (Used to **set** bits) |
| `^` | Bitwise XOR | 1 if bits differ (Used for **toggling**, crypto, zeroing registers) |
| `~` | Bitwise NOT | Inverts all bits (One's complement) |
| `<<` | Shift Left | Shifts bits left, multiplies by 2ⁿ |
| `>>` | Shift Right | Shifts bits right, divides by 2ⁿ |

### The Standard Bitmask Patterns:

```c
#include <stdio.h>
#include <stdint.h>

#define FLAG_READ    (1 << 0)  // 0001 (bit 0)
#define FLAG_WRITE   (1 << 1)  // 0010 (bit 1)
#define FLAG_EXECUTE (1 << 2)  // 0100 (bit 2)
#define FLAG_ADMIN   (1 << 3)  // 1000 (bit 3)

int main(void) {
    uint8_t user_perms = 0;

    // 1. SET a bit: use bitwise OR (|)
    user_perms |= (FLAG_READ | FLAG_WRITE); // 0011

    // 2. CHECK if a bit is set: use bitwise AND (&)
    if (user_perms & FLAG_WRITE) {
        printf("Write permission granted.\n");
    }

    // 3. CLEAR a bit: use AND with inverted mask (& ~FLAG)
    user_perms &= ~FLAG_WRITE; // clears bit 1

    // 4. TOGGLE a bit: use XOR (^)
    user_perms ^= FLAG_EXECUTE; // toggles bit 2 on/off

    return 0;
}
```

---

## 5. Integer Overflows & Security Bugs

An integer overflow occurs when an arithmetic operation attempts to create a numeric value that falls outside the range that can be represented with a given number of bits.

```c
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>

void allocate_buffer(uint16_t num_items) {
    // VULNERABILITY: Integer overflow in size calculation!
    // sizeof(uint32_t) is 4 bytes.
    // If num_items = 16385: 16385 * 4 = 65540
    // As a 16-bit number: 65540 & 0xFFFF = 4 bytes!
    uint16_t total_size = num_items * sizeof(uint32_t);

    printf("Requested %u items, allocated %u bytes\n", num_items, total_size);
    char *buf = (char *)malloc(total_size); // Allocates only 4 bytes!

    // Subsequent loop filling num_items will corrupt the heap!
    free(buf);
}
```

---

## Lesson Exercises & Challenges

### Challenge 1: Bitmask Flag Extractor
Implement a function in C:
```c
uint8_t get_security_tier(uint32_t status_word);
```
Where bits 8 to 11 of `status_word` encode a security tier (0 to 15). Extract and return these 4 bits shifted down to position 0.

### Challenge 2: Endianness Converter
Write a function `uint32_t swap_endian(uint32_t val)` that swaps the byte order of a 32-bit integer without using standard library functions like `htonl`. Use bitwise shifts and masks.
