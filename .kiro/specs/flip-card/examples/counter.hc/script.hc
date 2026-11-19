on openCard
  put 0 into field "count"
end openCard

on mouseUp
  if the target is "Increment" then
    put field "count" + 1 into field "count"
  end if
end mouseUp
