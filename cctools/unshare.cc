#define _GNU_SOURCE
#include <sched.h>
#include <unistd.h>

#include <cctype>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

struct flag {
    char* argname;
    int value;
};

const flag allflags[] = {
    #ifdef CLONE_FILES
        { "-fd", CLONE_FILES },
    #endif
    #ifdef CLONE_FS
        { "-fs", CLONE_FS },
    #endif
    #ifdef CLONE_NEWCGROUP
        { "-cgroup", CLONE_NEWCGROUP },
    #endif
    #ifdef CLONE_NEWIPC
        { "-ipc", CLONE_NEWIPC },
    #endif
    #ifdef CLONE_NEWNET
        { "-net", CLONE_NEWNET },
    #endif
    #ifdef CLONE_NEWNS
        { "-ns", CLONE_NEWNS },
    #endif
    #ifdef CLONE_NEWPID
        { "-pid", CLONE_NEWPID },
    #endif
    #ifdef CLONE_NEWTIME
        { "-time", CLONE_NEWTIME },
    #endif
    #ifdef CLONE_NEWUSER
        { "-user", CLONE_NEWUSER },
    #endif
    #ifdef CLONE_NEWUTS
        { "-uts", CLONE_NEWUTS },
    #endif
    #ifdef CLONE_SYSVSEM
        { "-sysvsem", CLONE_SYSVSEM },
    #endif
    { 0, 0 }
};


char* toLowerCase(char* str) {
    char* ptr = str;
    while (*ptr) {
        *ptr = std::tolower(*ptr);
        ptr++;
    }
    return str;
}


int main (int argc, char** argv) {

    int flags = 0;
    int argi;
    for (argi = 1; argi < argc - 1; ++argi) {
        if (argv[argi][0] != '-')
            break;

        char* lowerarg = toLowerCase(argv[argi]);
        bool found = false;
        for (const flag* item = allflags; item->argname && item->value != 0; ++item) {
            if (strcmp(lowerarg, item->argname) == 0) {
                flags |= item->value;
                found = true;
                break;
            }
        }

        if (!found) {
            printf("Failed to find %s flag", lowerarg);
            return 12;
        }
    }

    if (argc - argi < 1) {
        printf("bad args\n");
        printf("./unshare [flags] exec-file [exec-args]\n");
        return 13;
    }
    
    printf("flags: %d\n", flags);
    int err = unshare(flags);
    if (err != 0) {
        perror("unshare");
        exit(EXIT_FAILURE);
        return 0;
    }

    execvp(argv[argi], &argv[argi]);
    return 0;
}