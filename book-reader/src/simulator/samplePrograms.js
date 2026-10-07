// Sample ARM64 Assembly Programs for CPULator Simulator

export const SAMPLE_PROGRAMS = [
  {
    id: 'hello_world',
    title: 'Hello World (Syscall 64)',
    description: 'Classic AArch64 Hello World utilizing Linux sys_write (x8=64) and sys_exit (x8=93).',
    category: 'Fundamentals',
    code: `.global _start
.text

_start:
    // Linux sys_write(fd=1, buf=msg, count=14)
    mov x0, #1              // fd = 1 (stdout)
    adr x1, msg             // x1 = address of string
    mov x2, #14             // length of message
    mov x8, #64             // syscall 64: sys_write
    svc #0                  // invoke kernel

    // Linux sys_exit(status=0)
    mov x0, #0              // exit status 0
    mov x8, #93             // syscall 93: sys_exit
    svc #0

.data
msg:
    .asciz "Hello, ARM64!\\n"
`
  },
  {
    id: 'arithmetic',
    title: 'Arithmetic & Registers',
    description: 'Demonstrates basic 64-bit and 32-bit arithmetic: ADD, SUB, MUL, SDIV, and flag setting.',
    category: 'Fundamentals',
    code: `.global _start
.text

_start:
    mov x0, #25             // x0 = 25
    mov x1, #17             // x1 = 17
    add x2, x0, x1          // x2 = 25 + 17 = 42

    // Multiply
    mov x3, #6
    mul x4, x2, x3          // x4 = 42 * 6 = 252

    // Signed Division
    mov x5, #3
    sdiv x6, x4, x5         // x6 = 252 / 3 = 84

    // Test flags with subs (should set Z flag if zero)
    subs x7, x6, #84        // x7 = 84 - 84 = 0 (Z=1)

    // Exit
    mov x0, #0
    mov x8, #93
    svc #0
`
  },
  {
    id: 'if_else',
    title: 'Conditional Branching (If/Else)',
    description: 'Compares two values and branches conditionally using CMP, B.GT, and unconditional B.',
    category: 'Control Flow',
    code: `.global _start
.text

_start:
    mov x0, #40             // Value A
    mov x1, #25             // Value B

    // if (x0 > x1) goto greater_label;
    cmp x0, x1
    b.gt greater_label

less_or_equal:
    mov x2, #100            // Executed if x0 <= x1
    b done

greater_label:
    mov x2, #200            // Executed if x0 > x1

done:
    // Exit with result in x0
    mov x0, x2
    mov x8, #93
    svc #0
`
  },
  {
    id: 'while_loop',
    title: 'While Loop (Sum 1 to 10)',
    description: 'Computes the sum of numbers from 1 to 10 in a loop: 1 + 2 + ... + 10 = 55.',
    category: 'Control Flow',
    code: `.global _start
.text

_start:
    mov x0, #0              // x0: accumulator (sum = 0)
    mov x1, #1              // x1: counter (i = 1)
    mov x2, #10             // x2: limit = 10

loop_start:
    cmp x1, x2              // while (i <= 10)
    b.gt loop_end

    add x0, x0, x1          // sum += i
    add x1, x1, #1          // i++
    b loop_start

loop_end:
    // Result sum is in x0 (should be 55)
    mov x8, #93
    svc #0
`
  },
  {
    id: 'stack_subroutine',
    title: 'Functions & Stack Frames',
    description: 'Demonstrates ARM64 calling convention: saving FP/LR with STP, passing args in X0-X1, and returning with RET.',
    category: 'Functions & Memory',
    code: `.global _start
.text

_start:
    // Call square_sum(3, 4) -> 3^2 + 4^2 = 25
    mov x0, #3              // Argument 1
    mov x1, #4              // Argument 2
    bl square_sum

    // Result is returned in x0 (25)
    mov x8, #93
    svc #0

// Function: square_sum(a, b) -> a*a + b*b
square_sum:
    // Prologue: save Frame Pointer (x29) and Link Register (x30)
    stp x29, x30, [sp, #-16]!
    mov x29, sp

    mul x2, x0, x0          // a * a
    mul x3, x1, x1          // b * b
    add x0, x2, x3          // return value = (a*a) + (b*b)

    // Epilogue: restore FP and LR, pop stack frame
    ldp x29, x30, [sp], #16
    ret
`
  },
  {
    id: 'memory_array',
    title: 'Load & Store (Array Traversal)',
    description: 'Initializes memory and iterates through an array of 64-bit quad words using LDR with indexed offset.',
    category: 'Functions & Memory',
    code: `.global _start
.text

_start:
    adr x1, numbers         // x1 = base address of array
    mov x2, #0              // x2 = index i = 0
    mov x0, #0              // x0 = sum accumulator

loop:
    cmp x2, #4              // 4 elements in array
    b.ge end

    // Load 64-bit word: numbers[i]
    // lsl #3 multiplies index by 8 bytes
    ldr x3, [x1, x2, lsl #3]
    add x0, x0, x3          // sum += numbers[i]

    add x2, x2, #1          // i++
    b loop

end:
    // Total sum = 10 + 20 + 30 + 40 = 100
    mov x8, #93
    svc #0

.data
numbers:
    .quad 10
    .quad 20
    .quad 30
    .quad 40
`
  },
  {
    id: 'bitfield_ubfiz',
    title: 'Bit Manipulation (UBFIZ)',
    description: 'Unsigned Bitfield Insert into Zero (UBFIZ) as covered in Section 3 of the textbook.',
    category: 'Bit Manipulation',
    code: `.global _start
.text

_start:
    // ubfiz Xd, Xn, #lsb, #width
    // Takes #width bits from Xn starting at bit 0,
    // and places them at bit #lsb in Xd, zeroing other bits.
    mov x1, #0b1101         // x1 = 13 (binary 1101)

    // Insert 4 bits of x1 starting at bit position 8:
    // (13 << 8) = 3328 (hex 0x0D00)
    ubfiz x0, x1, #8, #4

    // Extract bits back using ubfx (unsigned bitfield extract)
    // Extract 4 bits starting at bit 8:
    ubfx x2, x0, #8, #4     // x2 should be restored to 13

    mov x8, #93
    svc #0
`
  },
  {
    id: 'fizzbuzz',
    title: 'FizzBuzz Implementation',
    description: 'Simulates the FizzBuzz program covered in Section 1 Lesson 7 using conditional checks.',
    category: 'Complete Programs',
    code: `.global _start
.text

_start:
    mov x19, #1             // i = 1
    mov x20, #15            // max = 15

fizzbuzz_loop:
    cmp x19, x20
    b.gt done

    // Check divisible by 15 (both 3 and 5)
    mov x1, #15
    udiv x2, x19, x1
    mul x3, x2, x1
    cmp x3, x19
    b.eq print_fizzbuzz

    // Check divisible by 3
    mov x1, #3
    udiv x2, x19, x1
    mul x3, x2, x1
    cmp x3, x19
    b.eq print_fizz

    // Check divisible by 5
    mov x1, #5
    udiv x2, x19, x1
    mul x3, x2, x1
    cmp x3, x19
    b.eq print_buzz

print_num:
    adr x0, str_num
    bl puts
    b next_iter

print_fizz:
    adr x0, str_fizz
    bl puts
    b next_iter

print_buzz:
    adr x0, str_buzz
    bl puts
    b next_iter

print_fizzbuzz:
    adr x0, str_fizzbuzz
    bl puts

next_iter:
    add x19, x19, #1
    b fizzbuzz_loop

done:
    mov x0, #0
    mov x8, #93
    svc #0

.data
str_fizz:     .asciz "Fizz"
str_buzz:     .asciz "Buzz"
str_fizzbuzz: .asciz "FizzBuzz"
str_num:      .asciz "Number"
`
  }
];
