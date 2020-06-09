#include <sys/resource.h>
#include <string>
#include <string.h>
#include <iostream>
#include <unistd.h>

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

int main(int argc, char** argv) {
    int argi;
    for (argi = 1; argi < argc; ++argi) {
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
                std::cout << "rlimit: " << limit->name << " = " << value << std::endl;
                setrlimit(limit->resource, &rlim);
                break;
            }
        }
    }

    execvp(argv[argi], &argv[argi]);
    return 0;
}