#!/bin/sh
### BEGIN INIT INFO
# Provides:          defaultdaemon
# Required-Start:    $remote_fs $syslog
# Required-Stop:     $remote_fs $syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Start daemon at boot time
# Description:       Enable service provided by daemon.
### END INIT INFO

dir="/home/bitnami/digestible"
user="root"
cmd="PORT=8080 node app.js"

name=`basename $0`
pid_file="/var/run/$name.pid"
stdout_log="/var/log/$name.log"
stderr_log="/var/log/$name.err"

get_pid() {
    cat "$pid_file"    
}

is_running() {
    [ -f "$pid_file" ] && ps `get_pid` > /dev/null 2>&1
}

case "$1" in
    start)
	if is_running; then
	    echo "Already started"
	else
	    echo "Starting $name"
	    cd "$dir"
        sudo -u "$user" $cmd > "$stdout_log" 2> "$stderr_log" \
			& echo $! > "$pid_file"
	    if ! is_running; then
		echo "Unable to start, see $stdout_log"
		exit 1
	    fi
	fi
	;;
    stop)
	if is_running; then
	    echo "Stopping $name"
	    kill `get_pid`
	    rm "$pid_file"
	else
	    echo "Not running"
	fi
	;;
    restart)
	$0 stop
	$0 start
	;;
    status)
	if is_running; then
	    echo "Running"
	else
	    echo "Stopped"
	    exit 1
	fi
	;;
    *)
	echo "Usage: $0 {start|stop|restart|status}"
	exit 1
	;;
esac

exit 0