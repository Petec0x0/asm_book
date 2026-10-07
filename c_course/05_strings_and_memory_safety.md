# Module 5: Strings, Buffers & Memory Safety

In C, strings are not objects. A string is simply a **contiguous sequence of bytes terminated by a null byte (`'\0'`, ASCII 0)**. Because C does not record the length of strings in metadata, string handling is the historical source of most critical security vulnerabilities.

---

## 1. C String Representation in Memory

Consider the string `"HELLO"`:

```
Index:       0      1      2      3      4      5
Character:  'H'    'E'    'L'    'L'    'O'   '\0'
Hex Byte:   0x48   0x45   0x4C   0x4C   0x4F   0x00
```

### String Literals vs Stack Buffers

```c
#include <stdio.h>

void demo_strings(void) {
    // 1. String Literal: Stored in .rodata (Read-Only Data)
    const char *literal = "Hello";
    // literal[0] = 'h'; // CRASH! Segmentation fault (writing to read-only page)

    // 2. Stack Buffer: Initialized on the Stack
    char stack_buf[] = "Hello";
    stack_buf[0] = 'h'; // Allowed! 'stack_buf' lives in writable stack memory.
}
```

---

## 2. Classic String Algorithms

### Reversing `strlen`
`strlen` calculates the length by scanning byte-by-byte until it finds a `0x00` byte:

```c
size_t my_strlen(const char *str) {
    size_t len = 0;
    while (str[len] != '\0') {
        len++;
    }
    return len;
}
```

### In Assembly (ARM64 Loop):
```assembly
my_strlen:
    mov     x1, x0          // x1 = pointer
.L_scan:
    ldrb    w2, [x1], #1    // Load 1 byte and advance pointer
    cbnz    w2, .L_scan     // Loop until byte == 0
    sub     x0, x1, x0      // Calculate difference
    sub     x0, x0, #1      // Exclude null terminator
    ret
```

---

## 3. The Classic Stack Buffer Overflow

Because standard C functions like `strcpy`, `strcat`, `sprintf`, and `gets` do not check buffer boundaries, copying more bytes than the destination can hold overwrites adjacent stack memory.

```c
#include <stdio.h>
#include <string.h>

void vulnerable_login(const char *input) {
    char password[16];
    int is_admin = 0;

    // VULNERABILITY: If input is 20 bytes long,
    // the extra 4 bytes overwrite the 'is_admin' variable!
    strcpy(password, input);

    if (is_admin != 0) {
        printf("[+] Access Granted! Welcome Administrator.\n");
    } else {
        printf("[-] Access Denied.\n");
    }
}
```

### Stack Layout During Buffer Overflow:
```
[ High Memory ]
+------------------------------------+
| Return Address (LR / RIP)          | <-- Overwrite this to hijack execution!
+------------------------------------+
| Saved Frame Pointer (FP / RBP)     |
+------------------------------------+
| is_admin (4 bytes)                 | <-- Overwritten first!
+------------------------------------+
| password[16] (16 bytes)            | <-- Destination buffer
+------------------------------------+
[ Low Memory - Stack Top ]
```

When an attacker sends 16 'A's followed by `\x01\x00\x00\x00`, `is_admin` becomes `1`, bypassing authentication without knowing the password!

---

## 4. Format String Vulnerabilities

Consider this common programmer mistake:

```c
// VULNERABLE:
printf(user_input);

// SAFE:
printf("%s", user_input);
```

When `printf(user_input)` is executed, the string is evaluated as a **format specification**:
* If `user_input` contains `%x %x %x %x`, `printf` reads subsequent registers and stack entries and prints them in hex (Information Disclosure / Stack Leak).
* If `user_input` contains `%s`, it dereferences a value from the stack as a pointer and prints the string (Memory Read).
* If `user_input` contains `%n`, it writes the number of bytes printed so far to the address pointed to by a stack argument (Arbitrary Memory Write!).

---

## Lesson Exercises & Challenges

### Challenge 1: Implement Safe String Copy
Implement `size_t safe_strncpy(char *dest, const char *src, size_t dest_size)`:
* It must copy at most `dest_size - 1` characters.
* It must **always** null-terminate `dest` (unlike standard `strncpy` which leaves destination unterminated if source length exceeds `dest_size`).
* Return the number of characters written.

### Challenge 2: Identify the Off-by-One Bug
Analyze the following loop:
```c
char buffer[10];
for (int i = 0; i <= 10; i++) {
    buffer[i] = 'A';
}
buffer[10] = '\0';
```
Why is this an off-by-one vulnerability? What memory location does `buffer[10]` modify?
