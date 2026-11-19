on mouseUp
  if the target is "Greet" then
    if field "name" is empty then
      answer "Please enter your name."
    else
      answer "Hello, " & field "name" & "!"
    end if
  end if
end mouseUp
