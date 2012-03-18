#!/bin/sh

function usage() {
  echo "usage: $0 [objdir] [output dir] path/to/schema.sql"
  exit 1
}

# check args
if test $# -ne 3; then
  usage
elif test ! -d $1; then
  echo "$1 must be a directory"
  usage
elif test ! -d $2; then
  echo "$2 must be a directory"
  usage
elif test ! -e $3 -o $(basename $3) != 'schema.sql'; then
  echo "$3 must point to schema.sql"
  usage
fi

cd $2

# merge and de-dupe sql scripts, feed into sqlite
echo "$0: generating database...";
(cat $3
echo 'BEGIN TRANSACTION;'
find $1 -name '*.cg.sql' | xargs cat
echo 'COMMIT;') > all.sql
if ! eval "sqlite3 graph.sqlite < all.sql > error.log"; then
  echo "$0: sqlite3 db generation failed"; exit 1;
fi
