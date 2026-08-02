#!/bin/sh

set -eu

usage() {
	printf '%s\n' 'Usage: run-report.sh [--cli PATH] -- [gitlog-html flags]' >&2
}

cli=''
if [ "${1-}" = '--cli' ]; then
	if [ "$#" -lt 2 ] || [ -z "$2" ]; then
		usage
		exit 2
	fi
	cli=$2
	shift 2
fi

if [ "${1-}" != '--' ]; then
	usage
	exit 2
fi
shift

if ! command -v git >/dev/null 2>&1; then
	printf '%s\n' 'error: Git is required but was not found on PATH.' >&2
	exit 1
fi

if [ -n "$cli" ]; then
	case $cli in
		*/*)
			if [ ! -x "$cli" ] || [ ! -f "$cli" ]; then
				printf 'error: --cli must name an executable regular file: %s\n' "$cli" >&2
				exit 1
			fi
			;;
		*)
			if ! resolved_cli=$(command -v "$cli" 2>/dev/null); then
				printf 'error: --cli executable was not found on PATH: %s\n' "$cli" >&2
				exit 1
			fi
			cli=$resolved_cli
			;;
	esac
else
	if resolved_cli=$(command -v gitlog-html 2>/dev/null); then
		cli=$resolved_cli
	else
		script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
		checkout_cli=$script_dir/../../../gitlog-html
		if [ -x "$checkout_cli" ] && [ -f "$checkout_cli" ]; then
			cli=$checkout_cli
		else
			printf '%s\n' 'error: gitlog-html was not found. Install it on PATH or build a repository-local executable with:' >&2
			printf '%s\n' '  go build -o ./gitlog-html ./cmd/gitlog-html' >&2
			printf '%s\n' 'Then retry with --cli /absolute/path/to/gitlog-html.' >&2
			exit 1
		fi
	fi
fi

exec "$cli" "$@"
