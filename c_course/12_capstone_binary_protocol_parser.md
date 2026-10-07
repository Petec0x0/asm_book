# Module 12: Capstone 2 - Binary Protocol Parser & CLI Utility

> **Real-World Systems Programming & Reverse Engineering Project**
> 
> Most critical software—game engines, network protocols, operating system caches, and database storage engines—stores data in custom binary file formats. In this capstone, you will design, serialize, and reverse-engineer a custom **Binary Employee Database Protocol**.

---

## 1. Protocol Specification

### File Header Format (16 Bytes, Packed)
Every valid database file must start with this 16-byte header:

```
Offset  Size  Type       Field Name     Description
-----------------------------------------------------------------
0x00    4     uint8_t[4] magic          Magic bytes: "\x7FDB1" (0x7F, 'D', 'B', '1')
0x04    2     uint16_t   version        Protocol version (1)
0x06    2     uint16_t   record_count   Number of records currently stored
0x08    4     uint32_t   file_size      Total file size in bytes
0x0C    4     uint32_t   checksum       Simple additive checksum of records
```

### Record Format (48 Bytes, Packed)
Each record represents an employee entry:

```
Offset  Size  Type       Field Name     Description
-----------------------------------------------------------------
0x00    4     uint32_t   id             Unique employee identifier
0x04    32    char[32]   name           Null-terminated UTF-8 name
0x24    8     uint64_t   salary         Annual salary in cents
0x2C    4     uint32_t   flags          Bit 0: Active, Bit 1: Manager
```

---

## 2. Parsing CLI Arguments with POSIX `getopt()`

A professional Unix command-line utility parses flags cleanly:

```c
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    int opt;
    char *filepath = NULL;
    char *add_name = NULL;
    int list_mode = 0;

    // Supported flags: -f <file>, -a <name>, -l (list)
    while ((opt = getopt(argc, argv, "f:a:l")) != -1) {
        switch (opt) {
            case 'f': filepath = optarg; break;
            case 'a': add_name = optarg; break;
            case 'l': list_mode = 1; break;
            default:
                fprintf(stderr, "Usage: %s -f <file> [-a <name>] [-l]\n", argv[0]);
                return 1;
        }
    }

    if (!filepath) {
        fprintf(stderr, "Error: -f <database_file> is required.\n");
        return 1;
    }
    return 0;
}
```

---

## 3. Serializing & Deserializing Headers with Low-Level I/O

```c
#include <fcntl.h>
#include <unistd.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>

#pragma pack(push, 1)
typedef struct {
    uint8_t  magic[4];
    uint16_t version;
    uint16_t count;
    uint32_t file_size;
    uint32_t checksum;
} db_header_t;
#pragma pack(pop)

int validate_header(int fd, db_header_t *hdr) {
    if (read(fd, hdr, sizeof(db_header_t)) != sizeof(db_header_t)) {
        return -1; // Failed to read complete header
    }

    // Verify magic bytes
    if (hdr->magic[0] != 0x7F || hdr->magic[1] != 'D' ||
        hdr->magic[2] != 'B'  || hdr->magic[3] != '1') {
        fprintf(stderr, "[-] Corrupt magic bytes!\n");
        return -1;
    }

    if (hdr->version != 1) {
        fprintf(stderr, "[-] Unsupported protocol version %u\n", hdr->version);
        return -1;
    }

    return 0; // Header is valid!
}
```

---

## 4. The Reverse Engineering Inspection Challenge

Compile your database tool and add two employees. Then inspect the file with `hexdump`:

```bash
hexdump -C employees.db
```

Output:
```
00000000  7f 44 42 31 01 00 02 00  70 00 00 00 2a 00 00 00  |.DB1....p...*...|
00000010  01 00 00 00 41 6c 69 63  65 00 00 00 00 00 00 00  |....Alice.......|
00000020  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00  |................|
00000030  00 00 00 00 00 e4 0b 00  00 00 00 00 01 00 00 00  |................|
```

Notice:
1. `7f 44 42 31`: The magic header bytes `\x7FDB1`.
2. `01 00`: Version `1` (stored in Little-Endian: least significant byte first).
3. `02 00`: Record count `2`.
4. `41 6c 69 63 65`: The ASCII characters `'A'`, `'l'`, `'i'`, `'c'`, `'e'` followed by null padding.

Congratulations! You have mastered the full bridge from high-level C to low-level system memory and reverse engineering.
