on mouseUp
  if the target is "Go" then
    put empty into field "list"
    repeat with i = 10 down to 1
      put field "list" & i & return into field "list"
    end repeat
    put field "list" & "Liftoff!" into field "list"
  end if
end mouseUp
