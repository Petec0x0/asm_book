# Module 4: Pointers, Memory Addressing & Pointer Arithmetic

Pointers are often considered the most confusing topic in C. In reverse engineering, however, **pointers are all there is**. A pointer is simply a 64-bit integer whose value happens to be a valid memory address.

---

## 1. Pointer Mechanics: Addresses and Dereferencing

Every variable in C resides at a specific address in memory:

```c
#include <stdio.h>
#include <stdint.h>

int main(void) {
    uint32_t score = 1337;
    uint32_t *score_ptr = &score; // '&' takes the address

    printf("Variable value:   %u\n", score);
    printf("Variable address: %p\n", (void *)&score);
    printf("Pointer value:    %p\n", (void *)score_ptr);
    printf("Dereferenced:     %u\n", *score_ptr); // '*' reads the target value

    // Modifying value through pointer
    *score_ptr = 9001;
    printf("New score:        %u\n", score); // prints 9001
    return 0;
}
```

### In Assembly:
* Taking an address (`&x`): `add x0, sp, #12` (computes address of local variable on stack).
* Storing a value (`*ptr = 9001`): `str w1, [x0]` (writes 32 bits into address held in `x0`).
* Loading a value (`x = *ptr`): `ldr w1, [x0]` (reads 32 bits from address held in `x0`).

---

## 2. Pointer Arithmetic: Scaled by Type Size

When you add `1` to an integer pointer, the CPU **does not add 1 byte**. It adds `sizeof(type)` bytes:

```c
#include <stdio.h>
#include <stdint.h>

int main(void) {
    uint8_t  *p8  = (uint8_t *)0x1000;
    uint16_t *p16 = (uint16_t *)0x1000;
    uint32_t *p32 = (uint32_t *)0x1000;
    uint64_t *p64 = (uint64_t *)0x1000;

    printf("p8  + 1 = %p (+1 byte)\n",  (void *)(p8 + 1));  // 0x1001
    printf("p16 + 1 = %p (+2 bytes)\n", (void *)(p16 + 1)); // 0x1002
    printf("p32 + 1 = %p (+4 bytes)\n", (void *)(p32 + 1)); // 0x1004
    printf("p64 + 1 = %p (+8 bytes)\n", (void *)(p64 + 1)); // 0x1008
    return 0;
}
```

### In Assembly (Scaled Indexing):
Look at how ARM64 implements `arr[i]` for an array of 64-bit integers:
```assembly
// x0 = base pointer to array (arr)
// x1 = index (i)
// Loads 64-bit value at address (arr + i * 8):
ldr     x2, [x0, x1, lsl #3]   // lsl #3 is bitshift left by 3, which multiplies by 8!
```
> **Reverse Engineering Rule:** When you see `lsl #2`, the compiler is indexing an array of 4-byte integers (`int32_t`). When you see `lsl #3`, it is indexing 8-byte integers or pointers (`uint64_t` or `void *`). When you see `lsl #1`, it is indexing 2-byte shorts (`int16_t`).

---

## 3. Arrays vs Pointers: Array Decay

In C, an array is a contiguous block of memory allocated on the stack or in `.data`.
However, whenever an array is passed to a function, it **decays into a pointer** to its first element:

```c
void print_first(int arr[]) {
    // Inside this function, sizeof(arr) is 8 bytes (the pointer size!), NOT the size of the array!
    printf("sizeof(arr) in func: %zu\n", sizeof(arr)); // 8
}

int main(void) {
    int numbers[10];
    printf("sizeof(numbers):     %zu\n", sizeof(numbers)); // 40 (10 * 4 bytes)
    print_first(numbers);
    return 0;
}
```

### Array Syntax is Syntactic Sugar
In C, the expression `arr[i]` is defined by the standard as:
```c
*(arr + i)
```
Because addition is commutative (`arr + i == i + arr`), this means:
```c
i[arr] == arr[i]; // Perfectly valid C!
```

---

## 4. Multi-Dimensional Arrays: Row-Major Memory Layout

Computers only have 1D linear memory. A 2D array `int matrix[3][4]` is laid out in memory in **Row-Major Order**:

```
matrix[0][0], matrix[0][1], matrix[0][2], matrix[0][3],
matrix[1][0], matrix[1][1], matrix[1][2], matrix[1][3],
matrix[2][0], matrix[2][1], matrix[2][2], matrix[2][3]
```

To access element `matrix[row][col]`, the compiler generates:
$$\text{Address} = \text{Base} + (\text{row} \times \text{NUM\_COLS} + \text{col}) \times \text{sizeof(element)}$$

---

## 5. `void *` and Type Punning

A `void *` is a generic pointer with no associated type. You cannot directly dereference a `void *` without casting it:

```c
#include <stdio.h>
#include <stdint.h>

void dump_hex_bytes(const void *buffer, size_t length) {
    const uint8_t *bytes = (const uint8_t *)buffer;
    for (size_t i = 0; i < length; i++) {
        printf("%02X ", bytes[i]);
    }
    printf("\n");
}
```

---

## Lesson Exercises & Challenges

### Challenge 1: Manual Memory Striding
Given `int32_t numbers[] = {10, 20, 30, 40, 50};`, write a function that iterates through the array and returns the sum **using pointer arithmetic only** without using brackets `[]`.

### Challenge 2: Reverse the Scaled Index
Look at this assembly instruction:
```assembly
ldr     w3, [x0, x1, lsl #2]
```
What is the C data type of the array elements being loaded? What is the size of each element in bytes?
