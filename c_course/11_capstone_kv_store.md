# Module 11: Capstone 1 - In-Memory Key-Value Store

> **Low Level Academy Milestone Project**
> 
> In this milestone project, you will build a production-grade **In-Memory Key-Value Database** from scratch in C. This project synthesizes everything you've learned: dynamic memory management, pointers, structs, string manipulation, hash functions, and memory leak prevention.

---

## 1. Project Architecture & Requirements

A hash table maps arbitrary string keys to string values with $O(1)$ average-case lookup time. When hash collisions occur, your implementation will use **Open Addressing with Linear Probing**.

To support deletions without breaking linear probe chains, deleted slots are marked with a special sentinel value known as a **Tombstone**.

### Data Structures & Interface (`kv.h`)

```c
#ifndef KV_H
#define KV_H

#include <stddef.h>

// Tombstone sentinel pointer to mark deleted slots
#define TOMBSTONE ((char *)0x1)

typedef struct {
    char *key;
    char *value;
} kv_entry_t;

typedef struct {
    kv_entry_t *entries;
    size_t      capacity;
    size_t      count;
} kv_t;

// API Functions:
kv_t  *kv_init(size_t capacity);
int    kv_put(kv_t *db, const char *key, const char *value);
char  *kv_get(kv_t *db, const char *key);
int    kv_delete(kv_t *db, const char *key);
void   kv_free(kv_t *db);

#endif // KV_H
```

---

## 2. Hash Function: DJB2 Algorithm

We use Dan Bernstein's classic `djb2` hash function, an industry standard for string hashing:

```c
static size_t hash_key(const char *str) {
    size_t hash = 5381;
    int c;
    while ((c = *str++)) {
        hash = ((hash << 5) + hash) + c; // hash * 33 + c
    }
    return hash;
}
```

---

## 3. Step-by-Step Implementation

### Step 1: Initializing the Database (`kv_init`)
```c
kv_t *kv_init(size_t capacity) {
    if (capacity == 0) return NULL;

    kv_t *db = (kv_t *)malloc(sizeof(kv_t));
    if (!db) return NULL;

    db->capacity = capacity;
    db->count = 0;
    // calloc guarantees all pointers start as NULL
    db->entries = (kv_entry_t *)calloc(capacity, sizeof(kv_entry_t));
    if (!db->entries) {
        free(db);
        return NULL;
    }

    return db;
}
```

### Step 2: Inserting & Updating Keys (`kv_put`)
* Handle collisions by linear probing: `(index + 1) % capacity`.
* If key already exists, overwrite value (free old value, duplicate new).
* If slot is empty or tombstone, claim it and increment `count`.
* Use `strdup()` to store heap copies of keys and values.

### Step 3: Searching (`kv_get`)
* Probe until key matches or an empty slot (`NULL`) is found.
* Skip over tombstones!

### Step 4: Deleting Keys (`kv_delete`)
* Locate key. Free `key` and `value`.
* Set `entry->key = TOMBSTONE` and `entry->value = NULL`.
* Decrement `count`.

### Step 5: Freeing All Resources (`kv_free`)
* Iterate through `entries`, freeing non-tombstone strings.
* Free `entries` array, then free `db`.

---

## 4. Complete Verification Test Suite

```c
#include <stdio.h>
#include <assert.h>
#include <string.h>

void run_tests(void) {
    kv_t *db = kv_init(16);
    assert(db != NULL);
    assert(db->count == 0);

    // Test Put & Get
    assert(kv_put(db, "user:1", "Alice") == 0);
    assert(kv_put(db, "user:2", "Bob") == 0);
    assert(strcmp(kv_get(db, "user:1"), "Alice") == 0);
    assert(strcmp(kv_get(db, "user:2"), "Bob") == 0);
    assert(kv_get(db, "nonexistent") == NULL);

    // Test Overwrite
    assert(kv_put(db, "user:1", "Alicia") == 0);
    assert(strcmp(kv_get(db, "user:1"), "Alicia") == 0);

    // Test Delete
    assert(kv_delete(db, "user:1") == 0);
    assert(kv_get(db, "user:1") == NULL);

    kv_free(db);
    printf("[+] All KV tests passed with zero leaks!\n");
}
```

---

## 5. Valgrind Verification
Compile and run with Valgrind to ensure zero memory leaks:
```bash
gcc -Wall -Wextra -g kv.c test_kv.c -o test_kv
valgrind --leak-check=full ./test_kv
```
You should see:
```
All heap blocks were freed -- no leaks are possible
ERROR SUMMARY: 0 errors from 0 contexts
```
