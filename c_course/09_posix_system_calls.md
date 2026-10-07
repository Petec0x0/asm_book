# Module 9: POSIX Systems Programming & System Calls

All software running in user space (Ring 3 on x86, EL0 on ARM) is strictly quarantined by the hardware MMU. To interact with the physical world—writing to disks, sending network packets, or spawning processes—a program must invoke **System Calls**.

---

## 1. File Descriptors & The Standard Streams

In Unix/Linux, "everything is a file". A **File Descriptor (fd)** is simply a non-negative integer representing an open file table entry inside kernel space:

| File Descriptor | Name | Constant | Standard Destination |
|---|---|---|---|
| `0` | Standard Input | `STDIN_FILENO` | Keyboard / Terminal input |
| `1` | Standard Output | `STDOUT_FILENO` | Terminal display |
| `2` | Standard Error | `STDERR_FILENO` | Terminal error stream |
| `3+` | Custom Files / Sockets | Returned by `open()`, `socket()` | Files, pipes, network connections |

---

## 2. Low-Level I/O: `open`, `read`, `write`, `close`

Unlike high-level C `FILE *` functions (`fopen`, `fread`, `fprintf`) which use user-space buffers, POSIX functions issue direct kernel syscalls:

```c
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <errno.h>
#include <string.h>

int main(void) {
    // 1. Open / Create file for writing
    int fd = open("test.bin", O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        perror("Failed to open file");
        return 1;
    }

    // 2. Write raw bytes to kernel
    const char *payload = "SECRET_HEADER\x01\x02\x03\x04";
    ssize_t bytes_written = write(fd, payload, 17);
    printf("Wrote %zd bytes to disk.\n", bytes_written);

    // 3. Close the descriptor
    close(fd);
    return 0;
}
```

---

## 3. Reading File Metadata: `stat` and `fstat`

In systems programming, you frequently need to check file size, permissions, and timestamps before reading:

```c
#include <sys/stat.h>
#include <stdio.h>

off_t get_file_size(const char *filename) {
    struct stat st;
    if (stat(filename, &st) != 0) {
        return -1;
    }
    return st.st_size; // File size in bytes
}
```

---

## 4. Error Handling & `errno`

POSIX system calls return `-1` on failure and set the thread-local global variable `errno`:

```c
#include <errno.h>
#include <string.h>
#include <stdio.h>

if (read(fd, buf, 10) < 0) {
    printf("Error code: %d, Message: %s\n", errno, strerror(errno));
}
```

---

## Lesson Exercises & Challenges

### Challenge 1: Custom Binary File Reader
Write a C function `ssize_t read_exact(int fd, void *buf, size_t count)`:
Because `read()` may return fewer bytes than requested (due to interrupts or network packets), write a loop that continues calling `read()` until either all `count` bytes are read, EOF is reached, or an unrecoverable error occurs.

### Challenge 2: Hex Dump CLI
Write a small C program that opens a file passed via `argv[1]` and prints each byte in hexadecimal format (16 bytes per line).
