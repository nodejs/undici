#!/bin/bash
modules=("common" "eventsource" "fetch" "interfaces" "mimesniff" "resources" "service-workers" "storage" "websockets" "xhr")

# Change Directory to the root of the repository
cd "$(dirname "$0")/.."

# Change Directory to test/fixtures directory
cd test/fixtures

# Remove the existing WPT directory and create a new empty one
rm -rf wpt && mkdir wpt

# Clone the latest version of the WPT repository into tmp-wpt directory
rm -rf tmp-wpt; git clone git@github.com:web-platform-tests/wpt.git --depth=1 tmp-wpt

# Copy License
mv ./tmp-wpt/LICENSE.md ./wpt/LICENSE.md

# Copy the required modules from tmp-wpt to wpt
for module in ${modules[@]}; do
  mv ./tmp-wpt/$module ./wpt/$module
done

# Remove the tmp-wpt directory
rm -rf tmp-wpt

# Check if there are any changes
git add . && git diff --quiet && git diff --cached --quiet

if [[ $? -eq 0 ]]; then
    echo "No changes in WPT"
else
  git branch -d wpt-update;
  git checkout -b wpt-update;
  git add .
  git commit -n -m "chore: update wpt"
  gh pr create --base main --head wpt-update --title "The bug is fixed" --body "Everything works again"
fi