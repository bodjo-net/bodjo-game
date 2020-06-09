#define _GNU_SOURCE
#include <sched.h>
#include <stdlib.h>
#include <unistd.h>
#include <string>
#include <string.h>
#include <sys/types.h>
#include <sys/resource.h>

struct Limit {
    int namelen;
	const char* name;
	__rlimit_resource resource;
};

const Limit limits[] = {
	#ifdef RLIMIT_AS
		{ 2, "as", RLIMIT_AS },
	#endif
	#ifdef RLIMIT_CORE
		{ 4, "core", RLIMIT_CORE },
	#endif
	#ifdef RLIMIT_CPU
		{ 3, "cpu", RLIMIT_CPU },
	#endif
	#ifdef RLIMIT_DATA
		{ 4, "data", RLIMIT_DATA },
	#endif
	#ifdef RLIMIT_FSIZE
		{ 5, "fsize", RLIMIT_FSIZE },
	#endif
	#ifdef RLIMIT_LOCKS
		{ 5, "locks", RLIMIT_LOCKS },
	#endif
	#ifdef RLIMIT_MEMLOCK
		{ 7, "memlock", RLIMIT_MEMLOCK },
	#endif
	#ifdef RLIMIT_MSGQUEUE
		{ 8, "msgqueue", RLIMIT_MSGQUEUE },
	#endif
	#ifdef RLIMIT_NICE
		{ 4, "nice", RLIMIT_NICE },
	#endif
	#ifdef RLIMIT_NOFILE
		{ 6, "nofile", RLIMIT_NOFILE },
	#endif
	#ifdef RLIMIT_NPROC
		{ 5, "nproc", RLIMIT_NPROC },
	#endif
	#ifdef RLIMIT_RSS
		{ 3, "rss", RLIMIT_RSS },
	#endif
	#ifdef RLIMIT_RTPRIO
		{ 6, "rtprio", RLIMIT_RTPRIO },
	#endif
	#ifdef RLIMIT_RTTIME
		{ 6, "rttime", RLIMIT_RTTIME },
	#endif
	#ifdef RLIMIT_SIGPENDING
		{ 10, "sigpending", RLIMIT_SIGPENDING },
	#endif
	#ifdef RLIMIT_STACK
		{ 5, "stack", RLIMIT_STACK },
	#endif
	{ 0, 0, static_cast<__rlimit_resource>(0) }
};

bool cmp(const char* a, char* b) {
    const char* aptr = a;
    char* bptr = b;
    while (*aptr && *bptr) {
        if (*aptr != *bptr)
            return false;
        aptr++;
        bptr++;
    }
    return true;
}

rlim_t parseLimit(char* str) {
    if (strcmp("inf", str) == 0)
        return RLIM_INFINITY;
    return std::stoi(str);
}

static void usage(char* pname) {
    fprintf(stderr, "Usage: %s {unshare options} {chroot-path} {uid} [rlimits] {execfile} [execargs]\n", pname);
    fprintf(stderr, "unshare options:\n");
    #ifdef CLONE_FILES
        fprintf(stderr, "   f - CLONE_FILES (fd)\n");
    #endif
    #ifdef CLONE_FS
        fprintf(stderr, "   F - CLONE_FS\n");
    #endif
    #ifdef CLONE_NEWCGROUP
        fprintf(stderr, "   c - CLONE_NEWCGROUP\n");
    #endif
    #ifdef CLONE_NEWIPC
        fprintf(stderr, "   i - CLONE_NEWIPC\n");
    #endif
    #ifdef CLONE_NEWNET
        fprintf(stderr, "   n - CLONE_NEWNET\n");
    #endif
    #ifdef CLONE_NEWNS
        fprintf(stderr, "   N - CLONE_NEWNS\n");
    #endif
    #ifdef CLONE_NEWPID
        fprintf(stderr, "   p - CLONE_NEWPID\n");
    #endif
    #ifdef CLONE_NEWTIME
        fprintf(stderr, "   t - CLONE_NEWTIME\n");
    #endif
    #ifdef CLONE_NEWUSER
        fprintf(stderr, "   u - CLONE_NEWUSER\n");
    #endif
    #ifdef CLONE_NEWUTS
        fprintf(stderr, "   U - CLONE_NEWUTS\n");
    #endif
    #ifdef CLONE_SYSVSEM
        fprintf(stderr, "   s - CLONE_SYSVSEM\n");
    #endif
    fprintf(stderr, "rlimits:\n");
    exit(EXIT_FAILURE);
}

#define errExit(msg) do { printf("%d", errno); perror(msg); exit(EXIT_FAILURE); } while (0)

int main(int argc, char** argv) {
    if (argc < 5)
        usage(argv[0]);

    // unshare
    int unshare_flags = 0;
    char* argptr = argv[1];
    while (*argptr) {
        switch (*argptr) {
            #ifdef CLONE_FILES
                case 'f': unshare_flags |= CLONE_FILES; break;
            #endif
            #ifdef CLONE_FS
                case 'F': unshare_flags |= CLONE_FS; break;
            #endif
            #ifdef CLONE_NEWCGROUP
                case 'c': unshare_flags |= CLONE_NEWCGROUP; break;
            #endif
            #ifdef CLONE_NEWIPC
                case 'i': unshare_flags |= CLONE_NEWIPC; break;
            #endif
            #ifdef CLONE_NEWNET
                case 'n': unshare_flags |= CLONE_NEWNET; break;
            #endif
            #ifdef CLONE_NEWNS
                case 'N': unshare_flags |= CLONE_NEWNS; break;
            #endif
            #ifdef CLONE_NEWPID
                case 'p': unshare_flags |= CLONE_NEWPID; break;
            #endif
            #ifdef CLONE_NEWTIME
                case 't': unshare_flags |= CLONE_NEWTIME; break;
            #endif
            #ifdef CLONE_NEWUSER
                case 'u': unshare_flags |= CLONE_NEWUSER; break;
            #endif
            #ifdef CLONE_NEWUTS
                case 'U': unshare_flags |= CLONE_NEWUTS; break;
            #endif
            #ifdef CLONE_SYSVSEM
                case 's': unshare_flags |= CLONE_SYSVSEM; break;
            #endif
        }
        argptr++;
    }
    if (unshare(unshare_flags))
        errExit("unshare");

    // chroot
    if (chroot(argv[2]))
        errExit("chroot");

    // uid
    int uid = std::stoi(argv[3]);
    if (setuid(uid))
        errExit("setuid");

    // rlimit
    int argi = 4;
    for (; argi < argc; ++argi) {
        if (argv[argi][0] != '-')
            break;
        for (const Limit* limit = limits; limit->name; ++limit) {
            if (argv[argi][1 + limit->namelen] != '=')
                continue;
            if (cmp(limit->name, &argv[argi][1])) {
                rlim_t value = parseLimit(&argv[argi][2+limit->namelen]);
                const struct rlimit rlim {
                    .rlim_cur = value,
                    .rlim_max = value
                };
                setrlimit(limit->resource, &rlim);
                break;
            }
        }
    }

    execv(argv[argi], &argv[argi]);
    return 0;
}