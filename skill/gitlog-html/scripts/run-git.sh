#!/bin/sh

set -eu

if ! command -v git >/dev/null 2>&1; then
	printf '%s\n' 'error: Git is required but was not found on PATH.' >&2
	exit 1
fi

# Match the CLI's repository and object-store isolation before the skill uses
# Git for selection or evidence. Keep this list synchronized with the routing
# and configuration variables filtered by internal/gitexec.Runner.
unset GIT_ALTERNATE_OBJECT_DIRECTORIES
unset GIT_ASKPASS
unset GIT_CEILING_DIRECTORIES
unset GIT_COMMON_DIR
unset GIT_CONFIG
unset GIT_CONFIG_GLOBAL
unset GIT_CONFIG_NOSYSTEM
unset GIT_CONFIG_PARAMETERS
unset GIT_CONFIG_SYSTEM
unset GIT_DIR
unset GIT_EDITOR
unset GIT_EXEC_PATH
unset GIT_EXTERNAL_DIFF
unset GIT_GRAFT_FILE
unset GIT_IMPLICIT_WORK_TREE
unset GIT_INDEX_FILE
unset GIT_INTERNAL_SUPER_PREFIX
unset GIT_NAMESPACE
unset GIT_OBJECT_DIRECTORY
unset GIT_PREFIX
unset GIT_SEQUENCE_EDITOR
unset GIT_SHALLOW_FILE
unset GIT_SSH
unset GIT_SSH_COMMAND
unset GIT_WORK_TREE
unset SSH_ASKPASS

# These variables can expose repository data through tracing even though they
# do not normally change commit selection.
unset GIT_TRACE
unset GIT_TRACE2
unset GIT_TRACE_CURL
unset GIT_TRACE_CURL_NO_DATA
unset GIT_TRACE_PACKET
unset GIT_TRACE_PACK_ACCESS
unset GIT_TRACE_PACKFILE
unset GIT_TRACE_PERFORMANCE
unset GIT_TRACE_REDACT
unset GIT_TRACE_REFS
unset GIT_TRACE_SETUP
unset GIT_TRACE_SHALLOW
unset GIT_TRACE2_BRIEF
unset GIT_TRACE2_CONFIG_PARAMS
unset GIT_TRACE2_DST_DEBUG
unset GIT_TRACE2_EVENT
unset GIT_TRACE2_PERF

GIT_CONFIG_COUNT=3
GIT_CONFIG_KEY_0=color.ui
GIT_CONFIG_VALUE_0=false
GIT_CONFIG_KEY_1=core.pager
GIT_CONFIG_VALUE_1=cat
GIT_CONFIG_KEY_2=core.hooksPath
GIT_CONFIG_VALUE_2=/dev/null
GIT_OPTIONAL_LOCKS=0
GIT_PAGER=cat
GIT_TERMINAL_PROMPT=0
NO_COLOR=1
PAGER=cat
export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
export GIT_CONFIG_KEY_1 GIT_CONFIG_VALUE_1 GIT_CONFIG_KEY_2 GIT_CONFIG_VALUE_2
export GIT_OPTIONAL_LOCKS GIT_PAGER GIT_TERMINAL_PROMPT NO_COLOR PAGER

exec git "$@"
