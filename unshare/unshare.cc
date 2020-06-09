#define _GNU_SOURCE
#include <sched.h>
#include <cctype>
#include <string.h>

struct flag {
    char* argname;
    int value;
};

const flag allflags[] = {
    { "-fd", CLONE_FILES },
    { "-fs", CLONE_FS },
    { "-cgroup", CLONE_NEWCGROUP },
    { "-ipc", CLONE_NEWIPC },
    { "-net", CLONE_NEWNET },
    { "-ns", CLONE_NEWNS },
    { "-pid", CLONE_NEWPID },
    { "-time", CLONE_NEWTIME },
    { "-user", CLONE_NEWUSER },
    { "-uts", CLONE_NEWUTS },
    { "-sysvsem", CLONE_SYSVSEM }
};

char* toLowerCase(char* str) {
    char* ptr = str;
    while (ptr) {
        *ptr = std::tolower(*ptr);
        ptr++;
    }
    return str;
}


int main (int argc, char** argv) {

    int flags = 0;
    for (int argi = 1; argi < argc; ++argi) {
        char* lowerarg = toLowerCase(argv[argi]);
        bool found = false;
        for (const flag* item = allflags; item->argname; ++item) {
            if (strcmp(lowerarg, item->argname) == 0) {
                flags |= item->value;
                found = true;
                break;
            }
        }
    }



    return 0;
}