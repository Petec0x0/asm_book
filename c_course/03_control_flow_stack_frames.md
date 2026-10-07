# Module 3: Control Flow, Stack Frames & Calling Conventions

Understanding control flow at the C level versus how the CPU executes it is the cornerstone of binary analysis and reverse engineering.

---

## 1. Branching & Conditionals in Disassembly

In C, an `if` statement tests an expression and conditionally executes a block:

```c
int check_access(int role_id) {
    if (role_id == 1337) {
        return 1; // Admin
    }
    return 0; // Guest
}
```

### How Compilers Invert the Condition
Notice that in assembly, the CPU does not branch into the body—it **tests the opposite condition and branches over the body**:

```assembly
// ARM64 Disassembly:
check_access:
    cmp     w0, #1337       // Compare role_id with 1337
    b.ne    .L_guest        // Branch if NOT EQUAL (inverted!)
    mov     w0, #1          // Body executed: return 1
    ret
.L_guest:
    mov     w0, #0          // return 0
    ret
```

> **Reverse Engineering Rule:** Compilers invert branching conditions to minimize unconditional jumps and keep straight-line code inside the CPU instruction cache.

---

## 2. Loops: `while`, `for`, and `do-while`

All loop constructs in C compile into the same three primitives:
1. **Loop Header / Condition Check** (`cmp` + conditional branch)
2. **Loop Body** (the work)
3. **Loop Latch / Step** (increment counter, unconditional jump back to header)

```c
int sum_array(const int *arr, int count) {
    int sum = 0;
    for (int i = 0; i < count; i++) {
        sum += arr[i];
    }
    return sum;
}
```

In decompiled output, the loop induction variable (`i`) is usually held entirely in a CPU register (`w2` or `ecx`) and may never be written to memory if optimizations (`-O2`) are active.

---

## 3. `switch` Statements & Jump Tables

When a `switch` has few or sparse cases, the compiler generates a cascade of `cmp` and conditional branches (identical to `if-else if-else`).

However, when a `switch` has dense cases, the compiler emits a **Jump Table**: an array of code pointers stored in `.rodata`:

```c
int dispatch_command(int cmd) {
    switch (cmd) {
        case 0: return handle_read();
        case 1: return handle_write();
        case 2: return handle_delete();
        case 3: return handle_update();
        default: return -1;
    }
}
```

### Disassembly of a Jump Table (ARM64):
```assembly
dispatch_command:
    cmp     w0, #3              // Check upper bound
    b.hi    .L_default          // If cmd > 3, jump to default
    adrp    x1, .L_jump_table   // Load base of jump table
    add     x1, x1, :lo12:.L_jump_table
    ldr     x2, [x1, w0, uxtw #3] // Load address from table: table[cmd]
    br      x2                  // Branch to target address!
```

> **Reverse Engineering Rule:** When you see an indexed load followed by an indirect branch (`br x2` on ARM or `jmp *rax` on x86), you have identified a compiled `switch` statement! Reconstructing the table entries tells you every valid command in the protocol.

---

## 4. The Stack Frame Anatomy

Every function invocation creates a **Stack Frame** on the CPU stack. The stack grows **downward** toward lower memory addresses:

```
+------------------------------------+ Higher Addresses
| Caller's Stack Frame               |
+------------------------------------+
| Incoming Arguments (> 8 on stack)  |
+------------------------------------+
| Return Address (saved LR / RIP)    | <-- Pushed on call
+------------------------------------+
| Saved Frame Pointer (FP / RBP)     | <-- Established by prologue
+------------------------------------+
| Local Variables & Buffers          | (e.g. char buf[64])
+------------------------------------+
| Stack Canary / Cookie (optional)   | (Security canary to detect overflow)
+------------------------------------+
| Outgoing Function Arguments        |
+------------------------------------+ <-- Current SP (Lowest Address)
```

### Function Prologue (Setting up the Frame):
```assembly
// ARM64:
stp     x29, x30, [sp, #-32]!   // Allocate 32 bytes & save FP, LR
mov     x29, sp                 // Set FP to base of new frame
```

### Function Epilogue (Tearing down the Frame):
```assembly
// ARM64:
ldp     x29, x30, [sp], #32     // Restore FP and LR, deallocate 32 bytes
ret                             // Return to caller
```

---

## 5. Calling Conventions (ABIs)

A **Calling Convention** is a standardized contract between functions defining how parameters are passed, how values are returned, and which registers must be preserved.

| Feature | ARM64 (AAPCS64) | x86_64 (System V ABI - Linux/macOS) |
|---|---|---|
| **Arguments 1 to 6** | `x0, x1, x2, x3, x4, x5` | `rdi, rsi, rdx, rcx, r8, r9` |
| **Arguments 7 to 8** | `x6, x7` | Pushed onto Stack |
| **Additional Arguments** | Pushed onto Stack | Pushed onto Stack |
| **Return Value** | `x0` (and `x1` if 128-bit) | `rax` (and `rdx` if 128-bit) |
| **Frame Pointer** | `x29` | `rbp` |
| **Link / Return Register** | `x30` (`lr`) | On top of stack (`rsp`) |
| **Callee-Saved Registers** | `x19` to `x28`, `x29`, `sp` | `rbx, rsp, rbp, r12, r13, r14, r15` |

---

## Lesson Exercises & Challenges

### Challenge 1: Stack Layout Calculation
Given the following C function:
```c
int vulnerable(int a, int b) {
    char name[32];
    int score = a + b;
    return score;
}
```
1. How many bytes of stack space are required for local variables?
2. Why might a compiler allocate 48 or 64 bytes instead of exactly 36 bytes? (Hint: 16-byte stack alignment).

### Challenge 2: Disassembly Calling Convention Matcher
Look at the following ARM64 snippet:
```assembly
mov     x0, #1
mov     x1, #20
mov     x2, #300
bl      calculate_tax
```
Write the equivalent C function call signature and invocation for `calculate_tax`.
