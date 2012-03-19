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

# check args
if test $# -ne 2; then
  echo "usage: $0 /path/to/gcc /path/to/dehydra"; exit 1;
elif test ! -d $1; then
  echo "gcc path $1 invalid (require path to gcc and g++ with plugin support)"; exit 1;
elif test ! -d $2; then
  echo "dehydra path $2 invalid (require path to gcc_treehydra.so)"; exit 1;
fi

# determine callgraph root path
cd `dirname $0`;
SCRIPTROOT=`pwd`;
cd - > /dev/null;

# paths used by this script
MOZCENTRAL=${SCRIPTROOT}/mozilla-central/
SOURCEROOT=${MOZCENTRAL}/mozilla
OBJDIR=${MOZCENTRAL}/obj-fx
DISTBIN=${OBJDIR}/dist/bin
DBROOT=${SCRIPTROOT}/db
DBBACKUP=${SCRIPTROOT}/db-backup

# variables exported for use by the build
export GCCBIN=$1
export DEHYDRA=$2
export SCRIPT=${SCRIPTROOT}/callgraph_static.js
export MOZCONFIG=${SCRIPTROOT}/mozconfig
export OBJDIR=${OBJDIR}

# check we have a tree
if test ! -d "${SOURCEROOT}"; then
  echo "$0: source tree not found. pulling...";
  mkdir ${MOZCENTRAL}
  cd ${MOZCENTRAL}
  if ! eval "hg clone http://hg.mozilla.org/mozilla-central mozilla"; then
    echo "$0: checkout failed"; exit 1;
  fi
fi

# clobber build
cd ${SOURCEROOT}
rm -rf ${OBJDIR}

# build the tree
echo "$0: building...";
if ! eval "make -s -f client.mk build"; then
  echo "$0: build failed"; exit 1;
fi

# move old db and sql scripts
rm -rf ${DBBACKUP}
mv ${DBROOT} ${DBBACKUP}
mkdir ${DBROOT}

${SCRIPTROOT}/generatedb.sh ${OBJDIR} ${DBROOT} ${SCRIPTROOT}/schema.sql

# generate dot file from edges
#${DISTBIN}/run-mozilla.sh ${DISTBIN}/xpcshell -v 180 ${SCRIPTROOT}/sqltodot.js ${DBROOT}/graph.sqlite ${DBROOT}/graph.dot ${MOZCENTRAL}
#dot -v -Tsvg -o ${DBROOT}/graph.svg ${DBROOT}/graph.dot

