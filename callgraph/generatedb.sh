# ##### BEGIN LICENSE BLOCK #####
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is mozilla.org code.
#
# The Initial Developer of the Original Code is
# The Mozilla Foundation.
# Portions created by the Initial Developer are Copyright (C) 2012
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
# Daniel Witte, Mozilla Corporation
# Ehren Metcalfe, ehren.m@gmail.com
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ##### END LICENSE BLOCK ##### #

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
